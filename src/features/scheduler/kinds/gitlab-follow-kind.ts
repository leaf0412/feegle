import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { AgentCli } from "@integrations/agent/agent-cli.js";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { GitLabClient } from "@integrations/gitlab/gitlab-client.js";
import type { FollowEntry, GitLabFollowStore } from "@integrations/gitlab/gitlab-follow-store.js";
import type { GitLabIssueSearchResult } from "@integrations/gitlab/gitlab-types.js";
import { parseGitLabIssueUrl } from "@integrations/gitlab/gitlab-url-parser.js";
import type { GitService } from "@infra/git/git-service.js";
import type { HandlerKind, HandlerRunResult } from "../handler-kind.js";
import type { TaskContext } from "../task-context.js";

const ParamsSchema = z.object({
  botUsername: z.string().min(1).describe("GitLab username of the bot account")
});

type Params = z.infer<typeof ParamsSchema>;

export class GitLabFollowKind implements HandlerKind<Params> {
  readonly id = "gitlab-follow";
  readonly title = "GitLab follow";
  readonly description = "Polls GitLab for @mentions, drives issues through analysis to push";

  constructor(
    private readonly deps: {
      gitlab: GitLabClient;
      store: GitLabFollowStore;
      agents: AgentProviderRegistry;
      git: GitService;
      config: { token: string; host: string; workspaceRoot: string } | null;
    }
  ) {}

  parseParams(input: unknown): Params {
    return ParamsSchema.parse(input);
  }

  describeParams(params: Params): string {
    return `bot: @${params.botUsername}`;
  }

  async run(ctx: TaskContext, params: Params): Promise<HandlerRunResult> {
    if (!this.deps.config) {
      throw new Error("gitlab-follow requires a [gitlab] section (token/host/workspace) in ~/.feegle/config.jsonc");
    }
    const issues = await this.deps.gitlab.searchMentionedIssues(params.botUsername, this.deps.config.host);
    ctx.logger.debug(`gitlab-follow: found ${issues.length} issues mentioning @${params.botUsername}`);

    for (const issue of issues) {
      if (issue.state === "closed") {
        const entry = this.storeEntryFromSearch(issue);
        const existing = this.deps.store.get(entry.host, entry.projectId, entry.issueIid);
        if (existing && existing.status !== "done" && existing.status !== "rejected") {
          this.deps.store.setStatus(existing, "rejected");
        }
        continue;
      }
      this.deps.store.ensureEntry(this.storeEntryFromSearch(issue));
    }

    const active = this.deps.store.listActive();
    const results: string[] = [];
    for (const entry of active) {
      try {
        const note = await this.advanceState(ctx, entry, params.botUsername);
        if (note) results.push(`#${entry.issueIid}: ${note}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(`gitlab-follow error #${entry.issueIid}`, { error: msg });
        this.deps.store.setStatus(entry, "failed", { errorMessage: msg });
        results.push(`#${entry.issueIid}: failed`);
      }
    }

    if (results.length === 0) return { outcome: "silent", note: "no progress" };
    return { outcome: "silent", note: results.join("; ") };
  }

  // ── state machine ──

  private async advanceState(
    ctx: TaskContext,
    entry: FollowEntry,
    botUsername: string
  ): Promise<string | null> {
    const parsed = parseGitLabIssueUrl(entry.issueUrl);

    switch (entry.status) {
      case "discovered":
        return this.stepClone(entry);

      case "cloning":
        return this.stepAnalyze(ctx, entry, parsed);

      case "proposed":
        return this.stepCheckProposed(ctx, entry, parsed, botUsername);

      case "branch_proposed":
        return this.stepCheckBranch(ctx, entry, parsed, botUsername);

      case "executing":
        return null;

      case "pushing":
        return this.stepPush(ctx, entry);

      default:
        return null;
    }
  }

  private async stepClone(entry: FollowEntry): Promise<string | null> {
    const repoPath = this.repoPath(entry);

    if (!existsSync(join(repoPath, ".git"))) {
      const parsed = parseGitLabIssueUrl(entry.issueUrl);
      const cloneUrl = `https://${parsed.host}/${parsed.namespace}/${parsed.project}.git`;
      mkdirSync(repoPath, { recursive: true });
      await this.deps.git.cloneWithToken(cloneUrl, repoPath, this.deps.config!.token);
    }

    this.deps.store.setStatus(entry, "cloning");
    return "repo ready, advancing to analyzing";
  }

  private async stepAnalyze(
    ctx: TaskContext,
    entry: FollowEntry,
    parsed: ReturnType<typeof parseGitLabIssueUrl>
  ): Promise<string | null> {
    const agent = this.deps.agents.resolveActiveAgent();
    if (!agent) {
      throw new Error("no active agent configured");
    }

    const [issue, notes] = await Promise.all([
      this.deps.gitlab.getIssue(parsed),
      this.deps.gitlab.getNotes(parsed)
    ]);

    const prompt = buildAnalysisPrompt(issue, notes);
    this.deps.store.setStatus(entry, "analyzing", { agentPrompt: prompt });

    const response = await agent.chat([{ role: "user", content: prompt }]);

    const commentBody = `## 自动分析\n\n${response}\n\n---\n回复任意内容确认方案并进入分支创建，或回复 **拒绝** 取消。`;
    await this.deps.gitlab.postNote(parsed, commentBody);

    this.deps.store.setStatus(entry, "proposed", { agentResponse: response });
    return "analysis posted";
  }

  private async stepCheckProposed(
    _ctx: TaskContext,
    entry: FollowEntry,
    parsed: ReturnType<typeof parseGitLabIssueUrl>,
    botUsername: string
  ): Promise<string | null> {
    const notes = await this.deps.gitlab.getNotes(parsed);

    const botCommentIdx = findLastIndex(
      notes,
      (n) => n.author.username === botUsername
    );
    if (botCommentIdx === -1) return null;

    const newNotes = notes.slice(botCommentIdx + 1).filter((n) => !n.system);
    if (newNotes.length === 0) return null;

    const userFeedback = newNotes.map((n) => n.body).join("\n");

    if (/拒绝|reject|cancel|取消/i.test(userFeedback)) {
      this.deps.store.setStatus(entry, "rejected", { userFeedback });
      return "user rejected";
    }

    const agent = this.deps.agents.resolveActiveAgent();
    if (!agent) throw new Error("no active agent configured");

    const branchPrompt = [
      "以下 GitLab issue 的方案已被用户确认。请为该实现分配一个分支名（遵循 yb/feat/snake_case 规范，不要用连字符）：",
      "",
      `Issue: ${entry.title}`,
      `用户反馈: ${userFeedback}`,
      "",
      "只需回复分支名，不要其他文字。"
    ].join("\n");

    const branchName = (await agent.chat([{ role: "user", content: branchPrompt }])).trim();

    const commentBody = `## 分支建议\n\n建议分支名：**\`${branchName}\`**\n\n回复确认后开始执行，或提供其他分支名。`;
    await this.deps.gitlab.postNote(parsed, commentBody);

    this.deps.store.setStatus(entry, "branch_proposed", { userFeedback, branchName });
    return "branch proposed";
  }

  private async stepCheckBranch(
    _ctx: TaskContext,
    entry: FollowEntry,
    parsed: ReturnType<typeof parseGitLabIssueUrl>,
    botUsername: string
  ): Promise<string | null> {
    const notes = await this.deps.gitlab.getNotes(parsed);

    const botCommentIdx = findLastIndex(
      notes,
      (n) => n.author.username === botUsername
    );
    if (botCommentIdx === -1) return null;

    const newNotes = notes.slice(botCommentIdx + 1).filter((n) => !n.system);
    if (newNotes.length === 0) return null;

    const userFeedback = newNotes.map((n) => n.body).join("\n");

    if (/拒绝|reject|cancel|取消/i.test(userFeedback)) {
      this.deps.store.setStatus(entry, "rejected", { userFeedback });
      return "user rejected branch";
    }

    let branchName = entry.branchName!;
    const branchMatch = userFeedback.match(
      /\b(yb\/(feat|fix|perf|ui|style|util|deploy|release|docs)\/[a-z0-9_]+)\b/
    );
    if (branchMatch) {
      branchName = branchMatch[1]!;
    }

    const repoPath = this.repoPath(entry);
    const worktreePath = `${repoPath}-wt-${entry.issueIid}`;

    const baseBranch = await this.resolveBaseBranch(repoPath);
    await this.deps.git.createWorktree({
      repoPath,
      worktreePath,
      baseBranch,
      newBranch: branchName
    });

    this.deps.store.setStatus(entry, "executing", { branchName, worktreePath });

    const parsedUrl = parseGitLabIssueUrl(entry.issueUrl);
    this.runExecution(_ctx, entry, parsedUrl, branchName, worktreePath);

    return "execution started";
  }

  private async stepPush(
    _ctx: TaskContext,
    entry: FollowEntry
  ): Promise<string | null> {
    if (!entry.worktreePath || !entry.branchName) {
      this.deps.store.setStatus(entry, "failed", { errorMessage: "missing worktree or branch" });
      return "push failed: missing data";
    }
    await this.deps.git.push(entry.worktreePath, entry.branchName);
    this.deps.store.setStatus(entry, "done");
    return "pushed";
  }

  // ── helpers ──

  private runExecution(
    ctx: TaskContext,
    entry: FollowEntry,
    parsed: ReturnType<typeof parseGitLabIssueUrl>,
    branchName: string,
    worktreePath: string
  ): void {
    const agent = this.deps.agents.resolveActiveAgent();
    if (!agent) {
      this.deps.store.setStatus(entry, "failed", { errorMessage: "no active agent configured" });
      return;
    }

    void (async () => {
      try {
        const issue = await this.deps.gitlab.getIssue(parsed);
        const notes = await this.deps.gitlab.getNotes(parsed);
        const task = buildExecutionTask(issue, notes, entry);
        await agent.runDevelopmentTask(
          { requirementId: `gitlab-${entry.id}`, title: entry.title, requirementText: task },
          { repositoryId: `repo-${entry.id}`, localPath: worktreePath, branchName },
          task,
          { cwd: worktreePath }
        );
        this.deps.store.setStatus(entry, "pushing");
        ctx.logger.info(`gitlab-follow #${entry.issueIid}: agent done, advancing to pushing`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.deps.store.setStatus(entry, "failed", { errorMessage: msg });
        ctx.logger.error(`gitlab-follow #${entry.issueIid}: execution failed`, { error: msg });
      }
    })();
  }

  private repoPath(entry: FollowEntry): string {
    const parsed = parseGitLabIssueUrl(entry.issueUrl);
    const nsPath = parsed.namespace ? `${parsed.namespace}/${parsed.project}` : parsed.project;
    return join(this.deps.config!.workspaceRoot, parsed.host, nsPath);
  }

  private async resolveBaseBranch(repoPath: string): Promise<string> {
    try {
      await this.deps.git.getBranchSha(repoPath, "main");
      return "main";
    } catch {
      return "master";
    }
  }

  private storeEntryFromSearch(issue: GitLabIssueSearchResult) {
    const parsed = parseGitLabIssueUrl(issue.web_url);
    return {
      host: parsed.host,
      projectId: issue.project_id,
      issueIid: issue.iid,
      issueUrl: issue.web_url,
      projectPath: parsed.namespace ? `${parsed.namespace}/${parsed.project}` : parsed.project,
      title: issue.title
    };
  }
}

// ── prompt builders ──

function buildAnalysisPrompt(
  issue: { title: string; description: string | null },
  notes: { body: string; author: { username: string } }[]
): string {
  const notesText = notes.length === 0
    ? "暂无评论"
    : notes.map((n) => `@${n.author.username}: ${n.body.slice(0, 300)}`).join("\n");

  return [
    "你是一个开发助手。请分析以下 GitLab issue 并给出实现方案。",
    "",
    `**标题**: ${issue.title}`,
    `**描述**: ${issue.description ?? "无"}`,
    "",
    "**评论**:",
    notesText,
    "",
    "请包含以下内容：",
    "1. 问题概述（1-2句）",
    "2. 涉及的关键上下文链接（需求、QA、关联issue等）",
    "3. 建议的实现方案（步骤级别）",
    "4. 预估影响范围（哪些文件/模块）"
  ].join("\n");
}

function buildExecutionTask(
  issue: { title: string; description: string | null },
  notes: { body: string; author: { username: string } }[],
  entry: FollowEntry
): string {
  return [
    `实现 GitLab issue: ${issue.title}`,
    "",
    `**原始需求**: ${issue.description ?? "无"}`,
    entry.agentResponse ? `\n**分析方案**: ${entry.agentResponse}` : "",
    entry.userFeedback ? `\n**用户反馈**: ${entry.userFeedback}` : "",
    "",
    "请按照方案实现代码，每个独立修改点单独 commit。"
  ].join("\n");
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}
