import { describe, expect, it } from "vitest";
import {
  formatProgressToolInput,
  formatProgressToolResult,
  formatTodoWriteInput,
  inlineCodeText,
  isBashToolName,
  isTodoWriteToolName,
  progressNoOutputText,
  progressResultDot
} from "../../src/feishu/feishu-tool-renderers.js";

describe("inlineCodeText", () => {
  it("trims and replaces backticks with apostrophes to avoid breaking inline code", () => {
    expect(inlineCodeText("  `cmd`  ")).toBe("'cmd'");
  });
});

describe("isBashToolName / isTodoWriteToolName", () => {
  it("matches the common aliases for Bash", () => {
    expect(isBashToolName("Bash")).toBe(true);
    expect(isBashToolName(" shell ")).toBe(true);
    expect(isBashToolName("run_shell_command")).toBe(true);
    expect(isBashToolName("python")).toBe(false);
  });

  it("matches TodoWrite case-insensitively", () => {
    expect(isTodoWriteToolName("TodoWrite")).toBe(true);
    expect(isTodoWriteToolName(" todowrite ")).toBe(true);
    expect(isTodoWriteToolName("Todo")).toBe(false);
  });
});

describe("formatTodoWriteInput", () => {
  it("renders status icons and active form annotations", () => {
    const input = JSON.stringify({
      todos: [
        { content: "Wire up retry", status: "in_progress", activeForm: "Wiring up retry" },
        { content: "Add tests", status: "pending" },
        { content: "Ship", status: "completed" }
      ]
    });
    expect(formatTodoWriteInput(input)).toBe(
      [
        "🔄 Wire up retry _(Wiring up retry)_",
        "⏳ Add tests",
        "✅ Ship"
      ].join("\n")
    );
  });

  it("returns empty string for unparseable or empty payloads", () => {
    expect(formatTodoWriteInput("not json")).toBe("");
    expect(formatTodoWriteInput(JSON.stringify({ todos: [] }))).toBe("");
  });
});

describe("formatProgressToolInput", () => {
  it("wraps Bash input in a bash fenced block", () => {
    expect(formatProgressToolInput("Bash", "ls -la")).toBe("```bash\nls -la\n```");
  });

  it("renders short non-bash input as inline code", () => {
    expect(formatProgressToolInput("Read", "src/x.ts")).toBe("`src/x.ts`");
  });

  it("falls back to text fenced block for multi-line or long input", () => {
    const longInput = "a".repeat(190);
    expect(formatProgressToolInput("Read", longInput).startsWith("```text\n")).toBe(true);
  });

  it("renders TodoWrite JSON as a readable list", () => {
    const formatted = formatProgressToolInput(
      "TodoWrite",
      JSON.stringify({ todos: [{ content: "Done", status: "completed" }] })
    );
    expect(formatted).toBe("✅ Done");
  });
});

describe("formatProgressToolResult", () => {
  it("wraps multi-line output in a plain fenced block", () => {
    expect(formatProgressToolResult("a\nb")).toBe("```\na\nb\n```");
  });

  it("returns short single-line output verbatim", () => {
    expect(formatProgressToolResult("done")).toBe("done");
  });

  it("returns empty string when there is nothing to render", () => {
    expect(formatProgressToolResult(" ")).toBe("");
  });
});

describe("progressNoOutputText", () => {
  it("returns the Chinese placeholder used by the rich card", () => {
    expect(progressNoOutputText()).toBe("无输出");
  });
});

describe("progressResultDot", () => {
  it("prioritises explicit success flag", () => {
    expect(progressResultDot({ success: true })).toBe("🟢");
    expect(progressResultDot({ success: false })).toBe("🔴");
  });

  it("uses exitCode when success is undefined", () => {
    expect(progressResultDot({ exitCode: 0 })).toBe("🟢");
    expect(progressResultDot({ exitCode: 2 })).toBe("🔴");
  });

  it("inspects status string when no numeric signal is present", () => {
    expect(progressResultDot({ status: "completed" })).toBe("🟢");
    expect(progressResultDot({ status: "failed" })).toBe("🔴");
    expect(progressResultDot({ status: "queued" })).toBe("⚪");
  });
});
