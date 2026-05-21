import type { GitLabIssue, GitLabNote, GitLabSummarySection } from "../../../gitlab/gitlab-types.js";

export function buildSummarySections(
  issue: GitLabIssue,
  notes: GitLabNote[],
  qaResults: { url: string; title: string; status: string; reporter: string }[]
): GitLabSummarySection {
  const issueBasics = [
    `- 标题：${issue.title}`,
    `- 状态：${issue.state === "opened" ? "Open" : "Closed"} | 指派人：@${issue.assignee?.username ?? "未指派"} | 截止：${issue.due_date ?? "无"}`,
    `- 描述摘要：${truncate(issue.description ?? "无描述", 200)}`
  ].join("\n");

  const commentSummary = notes.length === 0
    ? "暂无评论。"
    : notes.map((note, i) =>
        `${i + 1}. @${note.author.username}（${formatDate(note.created_at)}）：${truncate(note.body, 150)}`
      ).join("\n");

  const qaInfo = qaResults.length === 0
    ? "未发现 QA 链接。"
    : qaResults.map((qa) =>
        `- [${qa.title}](${qa.url}) | 状态：${qa.status} | 报告人：${qa.reporter}`
      ).join("\n");

  const aiSummary = "";
  const relatedLinks = "";

  return { issueBasics, commentSummary, qaInfo, aiSummary, relatedLinks };
}

export function assembleSummary(sections: GitLabSummarySection): string {
  return [
    "## Issue 总结",
    "",
    "**基本信息**",
    sections.issueBasics,
    "",
    "**评论摘要**",
    sections.commentSummary,
    "",
    ...(sections.qaInfo ? ["**QA 信息**", sections.qaInfo, ""] : []),
    ...(sections.aiSummary ? ["**AI 总结**", sections.aiSummary, ""] : []),
    ...(sections.relatedLinks ? ["**关联链接**", sections.relatedLinks] : [])
  ].join("\n");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}
