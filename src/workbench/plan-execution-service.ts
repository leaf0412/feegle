import { readFile } from "node:fs/promises";
import type { AgentCli } from "../agent/agent-cli.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import {
  buildBaseBranchPromptCard,
  buildPlanCompletedCard,
  buildPlanProgressCard,
  buildPlanPushResultCard,
  type PlanProgressStage
} from "../feishu/feishu-workbench-cards.js";
import type { GitService } from "../git/git-service.js";
import type { PlanArtifact, PlanArtifactStatus, PlanArtifactStore } from "./plan-artifact-store.js";
import { buildIterationPrompt, deriveSlug } from "./plan-execution-helpers.js";

const TERMINAL_STATUSES: PlanArtifactStatus[] = ["pushed", "cancelled", "cleaned", "failed"];

export interface PlanExecutionServiceDeps {
  feegleHome: string;
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">;
  store: PlanArtifactStore;
  git: Pick<
    GitService,
    | "getRepoRoot"
    | "getBranchSha"
    | "branchExists"
    | "listRemoteBranches"
    | "createWorktree"
    | "removeWorktree"
    | "isClean"
    | "diffStats"
    | "push"
  >;
  agent: Pick<AgentCli, "runDevelopmentTask">;
  now?: () => Date;
}

export type PlanExecutionReply =
  | { kind: "text"; text: string }
  | { kind: "feishu_card"; card: unknown }
  | { kind: "feishu_card_update"; card: unknown };

export class PlanExecutionService {
  constructor(private readonly deps: PlanExecutionServiceDeps) {}

  async approve(planId: string): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(planId);
    if (!plan) return { kind: "text", text: `计划不存在：${planId}` };

    if (TERMINAL_STATUSES.includes(plan.status)) {
      return { kind: "text", text: `该计划已结束（status=${plan.status}）` };
    }
    if (plan.status === "executing") {
      return { kind: "text", text: "该计划正在执行中" };
    }
    if (plan.status !== "pending_review") {
      return { kind: "text", text: `该计划当前状态不允许 approve（status=${plan.status}）` };
    }

    if (!plan.baseBranch) {
      this.deps.store.setStatus(planId, {
        status: "pending_base",
        expectedStatus: "pending_review"
      });
      const repoRoot = await this.deps.git.getRepoRoot(plan.workspacePath);
      const candidates = await this.deps.git.listRemoteBranches(repoRoot);
      const title = planIdToTitle(plan);
      const slug = deriveSlug(title, planId);
      return {
        kind: "feishu_card",
        card: buildBaseBranchPromptCard({
          planId,
          version: plan.version,
          title,
          defaultHeadBranch: `yb/feat/${slug}`,
          candidates
        })
      };
    }

    return { kind: "text", text: "TODO: baseBranch 已填，待 Task 11 实现执行链路" };
  }

  async submitBaseBranch(input: {
    planId: string;
    baseBranch: string;
    headBranch?: string;
  }): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(input.planId);
    if (!plan) return { kind: "text", text: `计划不存在：${input.planId}` };
    if (plan.status !== "pending_base") {
      return { kind: "text", text: `当前状态不允许提交 base（status=${plan.status}）` };
    }

    const repoRoot = await this.deps.git.getRepoRoot(plan.workspacePath);
    const candidates = await this.deps.git.listRemoteBranches(repoRoot);
    const baseExists = candidates.includes(input.baseBranch);
    const localExists = !baseExists && (await this.deps.git.branchExists(repoRoot, input.baseBranch));
    const title = planIdToTitle(plan);
    const defaultHeadBranch = input.headBranch ?? `yb/feat/${deriveSlug(title, plan.planId)}`;

    if (!baseExists && !localExists) {
      return {
        kind: "feishu_card",
        card: buildBaseBranchPromptCard({
          planId: input.planId,
          version: plan.version,
          title,
          defaultHeadBranch,
          candidates,
          reason: `提交的 base "${input.baseBranch}" 不在远程分支列表，请重新选择`
        })
      };
    }

    const baseSha = await this.deps.git.getBranchSha(repoRoot, input.baseBranch);
    const headBranch = sanitizeHeadBranch(input.headBranch) ?? `yb/feat/${deriveSlug(title, plan.planId)}`;
    const worktreePath = this.composeWorktreePath(repoRoot, plan.planId);

    this.deps.store.setBaseBranch(input.planId, {
      baseBranch: input.baseBranch,
      headBranch,
      expectedStatus: "pending_base"
    });

    await this.deps.git.createWorktree({
      repoPath: repoRoot,
      worktreePath,
      baseBranch: input.baseBranch,
      newBranch: headBranch
    });

    this.deps.store.setStatus(input.planId, {
      status: "approved",
      expectedStatus: "pending_base"
    });

    const messageId = await this.deps.client.sendInteractiveCard(
      plan.chatId,
      buildPlanProgressCard({
        planId: input.planId,
        version: plan.version,
        title,
        headBranch,
        iteration: 1,
        stage: "prepared",
        recentEvents: []
      })
    );

    this.deps.store.setExecution(input.planId, {
      baseSha,
      headBranch,
      worktreePath,
      ...(messageId ? { progressCardMessageId: messageId } : {}),
      status: "executing",
      expectedStatus: "approved"
    });

    void this.runIteration(input.planId, null);
    return undefined;
  }

  async reviseExecution(planId: string, note: string): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(planId);
    if (!plan) return { kind: "text", text: `计划不存在：${planId}` };
    if (plan.status !== "completed") {
      return { kind: "text", text: `当前状态不允许继续调整（status=${plan.status}）` };
    }
    this.deps.store.bumpIteration(planId, "completed", "executing");
    void this.runIteration(planId, note);
    return undefined;
  }

  async push(planId: string): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(planId);
    if (!plan) return { kind: "text", text: `计划不存在：${planId}` };
    if (plan.status !== "completed") {
      return { kind: "text", text: `当前状态不允许推送（status=${plan.status}）` };
    }
    if (!plan.worktreePath || !plan.headBranch) {
      return { kind: "text", text: "执行状态损坏：缺少 worktree / head branch" };
    }

    try {
      await this.deps.git.push(plan.worktreePath, plan.headBranch);
      this.deps.store.setStatus(planId, {
        status: "pushed",
        expectedStatus: "completed"
      });
      await this.renderPushResult(plan, true);
      return undefined;
    } catch (error) {
      const stderr = error instanceof Error ? error.message : String(error);
      await this.renderPushResult(plan, false, stderr);
      return undefined;
    }
  }

  async cancel(planId: string): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(planId);
    if (!plan) return { kind: "text", text: `计划不存在：${planId}` };
    if (TERMINAL_STATUSES.includes(plan.status)) {
      return { kind: "text", text: `该计划已结束（status=${plan.status}）` };
    }
    if (plan.status === "executing") {
      return { kind: "text", text: "执行中不能拒绝，请等待完成" };
    }

    if (plan.status === "completed" && plan.worktreePath) {
      try {
        await this.deps.git.removeWorktree(await this.deps.git.getRepoRoot(plan.workspacePath), plan.worktreePath);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.deps.store.setStatus(planId, {
          status: "cancelled",
          expectedStatus: "completed",
          errorMessage: `cancelled with worktree-remove failure: ${msg}`
        });
        return { kind: "text", text: `已标记拒绝；worktree 删除失败：${msg}` };
      }
      this.deps.store.setStatus(planId, {
        status: "cancelled",
        expectedStatus: "completed"
      });
      return { kind: "text", text: "已拒绝；worktree 已删除，分支保留在主仓库 reflog 中" };
    }

    this.deps.store.setStatus(planId, {
      status: "cancelled",
      expectedStatus: plan.status
    });
    return { kind: "text", text: "已取消计划" };
  }

  async cleanup(planId: string): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(planId);
    if (!plan) return { kind: "text", text: `计划不存在：${planId}` };
    if (plan.status !== "completed" && plan.status !== "pushed") {
      return { kind: "text", text: `当前状态不允许清理（status=${plan.status}）` };
    }
    if (!plan.worktreePath) {
      this.deps.store.setStatus(planId, {
        status: "cleaned",
        expectedStatus: plan.status
      });
      return { kind: "text", text: "无 worktree 需要清理" };
    }

    const repoRoot = await this.deps.git.getRepoRoot(plan.workspacePath);
    await this.deps.git.removeWorktree(repoRoot, plan.worktreePath);
    this.deps.store.setStatus(planId, {
      status: "cleaned",
      expectedStatus: plan.status
    });
    return { kind: "text", text: "已清理 worktree" };
  }

  private async renderPushResult(
    plan: Pick<PlanArtifact, "planId" | "version" | "headBranch" | "progressCardMessageId">,
    success: boolean,
    stderr?: string
  ): Promise<void> {
    if (!plan.progressCardMessageId || !plan.headBranch) return;
    await this.deps.client.updateInteractiveCard(
      plan.progressCardMessageId,
      buildPlanPushResultCard({
        planId: plan.planId,
        version: plan.version,
        title: plan.planId,
        headBranch: plan.headBranch,
        success,
        ...(stderr ? { stderr } : {})
      })
    );
  }

  private composeWorktreePath(repoRoot: string, planId: string): string {
    const repoName = repoRoot.split("/").filter(Boolean).pop() ?? "repo";
    return `${this.deps.feegleHome}/worktrees/${repoName}/${planId}`;
  }

  private async runIteration(planId: string, note: string | null): Promise<void> {
    const plan = this.deps.store.latest(planId);
    if (!plan?.worktreePath || !plan.headBranch || !plan.baseSha) return;

    const cardBaseInput = {
      planId,
      version: plan.version,
      title: plan.planId,
      headBranch: plan.headBranch,
      iteration: plan.executionIteration
    };
    const recent: string[] = [];
    const now = this.deps.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const headShaBefore = plan.headSha ?? null;
    const planContent = await readFile(plan.filePath, "utf8");
    const updateProgress = throttle(async (stage: PlanProgressStage) => {
      if (!plan.progressCardMessageId) return;
      await this.deps.client.updateInteractiveCard(
        plan.progressCardMessageId,
        buildPlanProgressCard({
          ...cardBaseInput,
          stage,
          recentEvents: recent.slice(-5)
        })
      );
    }, 2000);

    const onProgress = (event: { kind: string; text: string }) => {
      recent.push(`[${event.kind}] ${event.text}`);
      void updateProgress("executing");
    };

    try {
      await updateProgress.flushNow("executing");
      await this.deps.agent.runDevelopmentTask(
        { requirementId: planId, title: plan.planId, requirementText: planContent },
        { repositoryId: planId, localPath: plan.worktreePath, branchName: plan.headBranch },
        buildIterationPrompt(planContent, note),
        { cwd: plan.worktreePath, onProgress }
      );

      await updateProgress.flushNow("verifying");
      const clean = await this.deps.git.isClean(plan.worktreePath);
      if (!clean) {
        this.deps.store.setStatus(planId, {
          status: "failed",
          expectedStatus: "executing",
          errorMessage: "agent exited but working tree dirty (violates auto-commit)"
        });
        await updateProgress.flushNow("failed");
        return;
      }

      const headSha = await this.deps.git.getBranchSha(plan.worktreePath, "HEAD");
      const { commitCount, filesChanged } = await this.deps.git.diffStats(plan.worktreePath, plan.baseSha);
      const completedAt = now().toISOString();

      this.deps.store.appendIterationNote(planId, {
        iteration: plan.executionIteration,
        note,
        headShaBefore,
        headShaAfter: headSha,
        commitCountDelta: commitCount - (plan.commitCount ?? 0),
        filesChangedDelta: filesChanged - (plan.filesChanged ?? 0),
        startedAt,
        completedAt
      });
      this.deps.store.setHeadInfo(planId, {
        headSha,
        commitCount,
        filesChanged,
        status: "completed",
        expectedStatus: "executing"
      });

      const refreshed = this.deps.store.latest(planId);
      if (refreshed && plan.progressCardMessageId && refreshed.headBranch && refreshed.worktreePath) {
        await this.deps.client.updateInteractiveCard(
          plan.progressCardMessageId,
          buildPlanCompletedCard({
            planId,
            version: plan.version,
            title: plan.planId,
            headBranch: refreshed.headBranch,
            worktreePath: refreshed.worktreePath,
            iteration: refreshed.executionIteration,
            commitCount: refreshed.commitCount ?? 0,
            filesChanged: refreshed.filesChanged ?? 0,
            iterationNotes: refreshed.iterationNotes.map((entry) => ({
              iteration: entry.iteration,
              note: entry.note
            }))
          })
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        this.deps.store.setStatus(planId, {
          status: "failed",
          expectedStatus: "executing",
          errorMessage: message
        });
      } catch {
        return;
      }
      await updateProgress.flushNow("failed");
    }
  }
}

function planIdToTitle(plan: Pick<PlanArtifact, "planId">): string {
  return plan.planId;
}

function sanitizeHeadBranch(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!/^[a-z0-9_/]+$/.test(trimmed) || trimmed.includes("-")) {
    throw new Error(`invalid head branch (alphanum/underscore/slash only, no hyphen): ${value}`);
  }
  return trimmed;
}

interface ThrottledUpdate {
  (stage: PlanProgressStage): Promise<void>;
  flushNow(stage: PlanProgressStage): Promise<void>;
}

function throttle(fn: (stage: PlanProgressStage) => Promise<void>, intervalMs: number): ThrottledUpdate {
  let lastRun = 0;
  let inFlight: Promise<void> = Promise.resolve();

  const invoke = async (stage: PlanProgressStage) => {
    lastRun = Date.now();
    inFlight = fn(stage);
    await inFlight;
  };

  const wrapped: ThrottledUpdate = (async (stage: PlanProgressStage) => {
    const now = Date.now();
    if (now - lastRun >= intervalMs) {
      await invoke(stage);
    }
  }) as ThrottledUpdate;

  wrapped.flushNow = async (stage: PlanProgressStage) => {
    await inFlight;
    await invoke(stage);
  };

  return wrapped;
}
