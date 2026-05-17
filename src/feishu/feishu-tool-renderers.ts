import { preprocessFeishuMarkdown, sanitizeMarkdownURLs } from "./feishu-markdown.js";

export function inlineCodeText(text: string): string {
  return text.trim().replaceAll("`", "'");
}

export function isBashToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "bash" || normalized === "shell" || normalized === "run_shell_command";
}

export function isTodoWriteToolName(toolName: string): boolean {
  return toolName.trim().toLowerCase() === "todowrite";
}

interface TodoItem {
  activeForm?: string;
  content?: string;
  status?: string;
}

export function formatTodoWriteInput(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "";
  }
  const todos = (parsed as { todos?: unknown }).todos;
  if (!Array.isArray(todos) || todos.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const raw of todos) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const todo = raw as TodoItem;
    const content = (todo.content ?? "").trim();
    if (content === "") {
      continue;
    }
    const icon = todoStatusIcon(todo.status);
    const safeContent = content.replaceAll("`", "'");
    let line = `${icon} ${safeContent}`;
    const activeForm = (todo.activeForm ?? "").trim();
    if (activeForm !== "" && activeForm !== content) {
      line += ` _(${activeForm.replaceAll("`", "'")})_`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function todoStatusIcon(status: string | undefined): string {
  switch ((status ?? "").trim().toLowerCase()) {
    case "completed":
      return "✅";
    case "in_progress":
      return "🔄";
    case "pending":
      return "⏳";
    default:
      return "•";
  }
}

export function formatProgressToolInput(toolName: string, text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }

  if (isTodoWriteToolName(toolName)) {
    const formatted = formatTodoWriteInput(trimmed);
    if (formatted !== "") {
      return formatted;
    }
    return ["```text", trimmed, "```"].join("\n");
  }

  const processed = preprocessFeishuMarkdown(sanitizeMarkdownURLs(trimmed));
  if (processed.includes("```")) {
    return processed;
  }
  if (isBashToolName(toolName)) {
    return ["```bash", processed, "```"].join("\n");
  }
  if (processed.includes("\n") || processed.length > 180) {
    return ["```text", processed, "```"].join("\n");
  }
  return `\`${inlineCodeText(processed)}\``;
}

export function formatProgressToolResult(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  const processed = preprocessFeishuMarkdown(sanitizeMarkdownURLs(trimmed));
  if (processed.includes("```")) {
    return processed;
  }
  if (processed.includes("\n") || processed.length > 220) {
    return ["```", processed, "```"].join("\n");
  }
  return processed;
}

export function progressNoOutputText(): string {
  return "无输出";
}

export interface ProgressResultIndicator {
  status?: string;
  exitCode?: number;
  success?: boolean;
}

export function progressResultDot(indicator: ProgressResultIndicator): string {
  if (indicator.success !== undefined) {
    return indicator.success ? "🟢" : "🔴";
  }
  if (indicator.exitCode !== undefined) {
    return indicator.exitCode === 0 ? "🟢" : "🔴";
  }
  const status = (indicator.status ?? "").trim().toLowerCase();
  if (status === "completed" || status === "success" || status === "succeeded" || status === "ok") {
    return "🟢";
  }
  if (status === "failed" || status === "error") {
    return "🔴";
  }
  return "⚪";
}
