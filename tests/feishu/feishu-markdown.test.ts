import { describe, expect, it } from "vitest";
import {
  buildPostJSON,
  buildPostMdJSON,
  containsMarkdown,
  countMarkdownTables,
  hasComplexMarkdown,
  isValidFeishuHref,
  parseInlineMarkdown,
  preprocessFeishuMarkdown,
  sanitizeMarkdownURLs,
  splitMarkdownByTables
} from "../../src/integrations/feishu/feishu-markdown.js";

describe("containsMarkdown", () => {
  it("recognises common indicators", () => {
    expect(containsMarkdown("hello **bold**")).toBe(true);
    expect(containsMarkdown("```ts\ncode\n```")).toBe(true);
    expect(containsMarkdown("see `code`")).toBe(true);
    expect(containsMarkdown("# Title")).toBe(false);
    expect(containsMarkdown("foo\n# Title")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(containsMarkdown("just a sentence")).toBe(false);
  });
});

describe("hasComplexMarkdown", () => {
  it("flags fenced code blocks", () => {
    expect(hasComplexMarkdown("text\n```bash\nls\n```")).toBe(true);
  });

  it("flags markdown tables", () => {
    expect(hasComplexMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(true);
  });

  it("treats inline bold as non-complex", () => {
    expect(hasComplexMarkdown("hello **bold**")).toBe(false);
  });
});

describe("countMarkdownTables", () => {
  it("counts distinct tables separated by blank lines", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n\n| x | y |\n|---|---|\n| 3 | 4 |";
    expect(countMarkdownTables(md)).toBe(2);
  });

  it("returns zero when no table is present", () => {
    expect(countMarkdownTables("plain text")).toBe(0);
  });
});

describe("splitMarkdownByTables", () => {
  it("keeps the markdown in a single chunk when within the limit", () => {
    const md = "| a |\n|---|\n| 1 |";
    expect(splitMarkdownByTables(md, 5)).toEqual([md]);
  });

  it("splits at the (maxTables+1)-th table block", () => {
    const blocks = Array.from({ length: 3 }, (_, idx) => `| col${idx} |\n|---|\n| ${idx} |`).join("\n\n");
    const result = splitMarkdownByTables(blocks, 1);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("col0");
    expect(result[1]).toContain("col1");
    expect(result[2]).toContain("col2");
  });
});

describe("isValidFeishuHref", () => {
  it("accepts http and https schemes", () => {
    expect(isValidFeishuHref("https://example.com")).toBe(true);
    expect(isValidFeishuHref("http://example.com")).toBe(true);
  });

  it("rejects schemes Feishu refuses (230001)", () => {
    expect(isValidFeishuHref("ftp://example.com")).toBe(false);
    expect(isValidFeishuHref("javascript:alert(1)")).toBe(false);
    expect(isValidFeishuHref("mailto:a@b.com")).toBe(false);
    expect(isValidFeishuHref("/relative/path")).toBe(false);
  });
});

describe("sanitizeMarkdownURLs", () => {
  it("keeps http(s) markdown links unchanged", () => {
    const md = "See [docs](https://example.com/x).";
    expect(sanitizeMarkdownURLs(md)).toBe(md);
  });

  it("rewrites invalid-scheme links as plain text to avoid Feishu 230001", () => {
    expect(sanitizeMarkdownURLs("mail [me](mailto:a@b.com)")).toBe("mail me (mailto:a@b.com)");
  });
});

describe("preprocessFeishuMarkdown", () => {
  it("inserts a newline before mid-text code fences", () => {
    expect(preprocessFeishuMarkdown("intro```ts\nfoo\n```")).toBe("intro\n```ts\nfoo\n```");
  });

  it("leaves a code fence at the start untouched", () => {
    expect(preprocessFeishuMarkdown("```ts\nfoo\n```")).toBe("```ts\nfoo\n```");
  });
});

describe("parseInlineMarkdown", () => {
  it("emits a plain text segment when no markup is present", () => {
    expect(parseInlineMarkdown("hello world")).toEqual([{ tag: "text", text: "hello world" }]);
  });

  it("splits bold runs with explicit style", () => {
    expect(parseInlineMarkdown("hi **world**!")).toEqual([
      { tag: "text", text: "hi " },
      { tag: "text", text: "world", style: ["bold"] },
      { tag: "text", text: "!" }
    ]);
  });

  it("emits anchor segments for valid links", () => {
    expect(parseInlineMarkdown("see [docs](https://x.com) more")).toEqual([
      { tag: "text", text: "see " },
      { tag: "a", text: "docs", href: "https://x.com" },
      { tag: "text", text: " more" }
    ]);
  });

  it("rejects links with invalid schemes and keeps them as text", () => {
    const result = parseInlineMarkdown("mail [me](mailto:x@y.com)");
    expect(result.some((segment) => segment.tag === "a")).toBe(false);
  });

  it("preserves unmatched bold as literal text", () => {
    expect(parseInlineMarkdown("foo **bar")).toEqual([
      { tag: "text", text: "foo " },
      { tag: "text", text: "**bar" }
    ]);
  });
});

describe("buildPostMdJSON", () => {
  it("wraps content in zh_cn md segment and sanitises links", () => {
    const json = buildPostMdJSON("see [bad](mailto:a@b.com)");
    expect(JSON.parse(json)).toEqual({
      zh_cn: { content: [[{ tag: "md", text: "see bad (mailto:a@b.com)" }]] }
    });
  });
});

describe("buildPostJSON", () => {
  it("emits code_block segments from fenced code", () => {
    const json = JSON.parse(buildPostJSON("```bash\nls\n```")) as {
      zh_cn: { content: Array<Array<Record<string, unknown>>> };
    };
    const blocks = json.zh_cn.content.flat();
    const codeBlock = blocks.find((segment) => segment.tag === "code_block");
    expect(codeBlock).toEqual({ tag: "code_block", language: "bash", text: "ls" });
  });

  it("converts ATX headings to bold runs", () => {
    const json = JSON.parse(buildPostJSON("## Title")) as {
      zh_cn: { content: Array<Array<Record<string, unknown>>> };
    };
    const segments = json.zh_cn.content[0];
    expect(segments).toEqual([{ tag: "text", text: "Title", style: ["bold"] }]);
  });
});
