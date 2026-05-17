import type { PlatformProgressEntry, PlatformProgressSnapshot } from "../platform/progress.js";

export function renderFeishuProgressCard(snapshot: PlatformProgressSnapshot): Record<string, unknown> {
  const state = progressState(snapshot.state, snapshot.title);
  const elements: unknown[] = [];

  if (snapshot.truncated) {
    elements.push({
      tag: "div",
      text: { tag: "plain_text", content: "仅显示最近更新。", text_size: "notation", text_color: "grey" }
    });
    elements.push({ tag: "hr" });
  }

  snapshot.entries.forEach((entry, index) => {
    elements.push(renderEntry(entry));
    if (index < snapshot.entries.length - 1) {
      elements.push({ tag: "hr" });
    }
  });

  if (snapshot.state !== "running") {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: { tag: "plain_text", content: state.footer, text_size: "notation", text_color: "grey" }
    });
  }

  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
      update_multi: true,
      enable_forward_interaction: true
    },
    header: {
      template: state.template,
      title: { tag: "plain_text", content: state.title }
    },
    body: {
      elements: elements.length > 0 ? elements : [{ tag: "markdown", content: " " }]
    }
  };
}

function progressState(
  state: PlatformProgressSnapshot["state"],
  title: string
): { title: string; template: string; footer: string } {
  if (state === "completed") {
    return { title: `${title} · 已完成`, template: "green", footer: "本过程卡片已停止更新，完整答复见下一条消息。" };
  }
  if (state === "failed") {
    return { title: `${title} · 失败`, template: "red", footer: "本过程卡片已停止更新（失败），完整错误说明见下一条消息。" };
  }
  return { title: `${title} · 进行中`, template: "blue", footer: "" };
}

function renderEntry(entry: PlatformProgressEntry): unknown {
  if (entry.kind === "thinking") {
    return {
      tag: "div",
      text: { tag: "plain_text", content: `思考：${entry.text}`, text_size: "notation", text_color: "grey" }
    };
  }
  if (entry.kind === "tool_use") {
    return {
      tag: "markdown",
      content: `<text_tag color='blue'>工具调用</text_tag> \`${entry.tool ?? "Tool"}\`\n\`\`\`text\n${entry.text}\n\`\`\``
    };
  }
  if (entry.kind === "tool_result") {
    return {
      tag: "markdown",
      content: `<text_tag color='turquoise'>工具结果</text_tag>${entry.tool ? ` \`${entry.tool}\`` : ""}\n${entry.text || "无输出"}`
    };
  }
  if (entry.kind === "error") {
    return {
      tag: "markdown",
      content: `<text_tag color='red'>错误</text_tag>\n${entry.text}`
    };
  }
  if (entry.kind === "tool_step") {
    return {
      tag: "markdown",
      content: renderToolStepFallback(entry)
    };
  }
  return { tag: "markdown", content: entry.text };
}

function renderToolStepFallback(entry: PlatformProgressEntry & { kind: "tool_step" }): string {
  const lines: string[] = [`<text_tag color='blue'>工具</text_tag> \`${entry.name}\``];
  if (entry.summary) {
    lines.push(entry.summary);
  }
  if (entry.result) {
    lines.push(entry.result);
  }
  return lines.join("\n");
}
