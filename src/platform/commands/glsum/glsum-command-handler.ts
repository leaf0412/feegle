import type { AgentCli, AgentChatMessage } from "../../../agent/agent-cli.js";
import type { GitLabClient } from "../../../gitlab/gitlab-client.js";
import type { GitLabIssueUrl } from "../../../gitlab/gitlab-types.js";
import { parseGitLabIssueUrl } from "../../../gitlab/gitlab-url-parser.js";
import type { SlashCommandContext, SlashCommandHandler, SlashCommandReply } from "../../slash-command-handler.js";
import { assembleSummary, buildSummarySections } from "./build-summary.js";
import { scanQaUrls } from "./scan-qa-urls.js";

export class GlsumCommandHandler implements SlashCommandHandler {
  readonly id = "glsum";

  constructor(
    private readonly client: GitLabClient,
    private readonly agent?: AgentCli
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    try {
      return await this.doExecute(context);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return { kind: "text", text: message };
    }
  }

  private async doExecute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const issueUrl = this.parseUrl(context.args);

    const [issue, notes] = await Promise.all([
      this.client.getIssue(issueUrl),
      this.client.getNotes(issueUrl)
    ]);

    const qaUrls = this.collectQaUrls(issue, notes);

    const qaResults = await this.collectQaInfo(qaUrls);

    const aiSummary = await this.generateAiSummary(issue, notes, qaUrls);

    const sections = buildSummarySections(issue, notes, qaResults);
    const summary = assembleSummary({
      ...sections,
      aiSummary: aiSummary ?? sections.aiSummary
    });

    await this.client.postNote(issueUrl, summary).catch((err) => {
      console.error("Failed to post GitLab comment:", err);
    });

    const postedTo = `https://${issueUrl.host}/${issueUrl.namespace ? `${issueUrl.namespace}/` : ""}${issueUrl.project}/-/issues/${issueUrl.issueIid}`;

    const reply = `总结已写入 ${postedTo}\n\n${summary.slice(0, 500)}`;

    return { kind: "text", text: reply };
  }

  private parseUrl(raw: string): GitLabIssueUrl {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error("请提供 GitLab issue 链接，例如 /glsum https://www.lejuhub.com/pc/proj/-/issues/14");
    }
    try {
      return parseGitLabIssueUrl(trimmed);
    } catch {
      throw new Error("无法解析该 issue 链接，请确认链接格式正确");
    }
  }

  private collectQaUrls(issue: { description: string | null }, notes: { body: string }[]): string[] {
    const texts = [issue.description ?? "", ...notes.map((n) => n.body)];
    const allUrls = texts.flatMap((text) => scanQaUrls(text));
    return [...new Set(allUrls)];
  }

  private async collectQaInfo(urls: string[]): Promise<{ url: string; title: string; status: string; reporter: string }[]> {
    if (urls.length === 0) return [];
    if (!this.agent) {
      return urls.map((url) => ({ url, title: "(需 Agent 抓取)", status: "未知", reporter: "未知" }));
    }

    const prompt = [
      "请使用浏览器工具分别打开以下 QA 页面，提取每个页面的以下信息：",
      "- 标题（缺陷名称）",
      "- 状态",
      "- 报告人",
      "- 经办人",
      "",
      ...urls.map((url, i) => `${i + 1}. ${url}`),
      "",
      "请以 JSON 数组格式返回，每个元素包含 url, title, status, reporter 字段。只返回 JSON，不要其他文字。"
    ].join("\n");

    try {
      const result = await this.agent.chat([{ role: "user", content: prompt }]);
      const parsed = this.extractJson(result);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to returning URLs with placeholder info
    }
    return urls.map((url) => ({ url, title: "(抓取失败)", status: "未知", reporter: "未知" }));
  }

  private async generateAiSummary(
    issue: { title: string; description: string | null },
    notes: { body: string; author: { username: string } }[],
    qaUrls: string[]
  ): Promise<string | null> {
    if (!this.agent) return null;

    const notesSummary = notes.length === 0
      ? "暂无评论"
      : notes.map((n) => `@${n.author.username}: ${n.body.slice(0, 200)}`).join("\n");

    const messages: AgentChatMessage[] = [{
      role: "user",
      content: [
        "请对以下 GitLab issue 做一份简短的中文总结（150字以内），涵盖：",
        "",
        `**Issue 标题**：${issue.title}`,
        `**Issue 描述**：${issue.description ?? "无"}`,
        "**评论内容**：",
        notesSummary,
        qaUrls.length > 0 ? `\n**QA 链接**：\n${qaUrls.join("\n")}` : "",
      ].join("\n")
    }];

    try {
      return await this.agent.chat(messages);
    } catch {
      return null;
    }
  }

  private extractJson(text: string): unknown {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
