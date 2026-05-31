import { describe, expect, it } from "vitest";
import {
  extractInteractiveCardText,
  extractPostPlainText,
  replaceMentions
} from "@integrations/feishu/feishu-content-extractor.js";

describe("replaceMentions", () => {
  it("substitutes @_user_X placeholders with display names", () => {
    const text = "你好 @_user_1，看看 @_user_2";
    const out = replaceMentions(text, [
      { key: "@_user_1", name: "Alice" },
      { key: "@_user_2", name: "Bob" }
    ]);
    expect(out).toBe("你好 @Alice，看看 @Bob");
  });

  it("keeps text unchanged when mentions list is missing or incomplete", () => {
    expect(replaceMentions("hi", undefined)).toBe("hi");
    expect(replaceMentions("hi @_user_1", [{ key: "@_user_1" }])).toBe("hi @_user_1");
  });
});

describe("extractPostPlainText", () => {
  it("flattens locale-wrapped post content with text/a/at/img/code_block", () => {
    const content = JSON.stringify({
      zh_cn: {
        title: "Headline",
        content: [
          [
            { tag: "text", text: "see " },
            { tag: "a", text: "docs" },
            { tag: "at", user_id: "all" }
          ],
          [
            { tag: "img" },
            { tag: "code_block", language: "ts", text: "const x = 1" }
          ]
        ]
      }
    });
    expect(extractPostPlainText(content)).toBe("Headline\nsee docs@all\n[image]```ts\nconst x = 1\n```");
  });

  it("returns empty string when the JSON does not look like a post", () => {
    expect(extractPostPlainText("not json")).toBe("");
    expect(extractPostPlainText("{}")).toBe("");
  });
});

describe("extractInteractiveCardText", () => {
  it("flattens schema 2.0 cards via body.property.elements with code_block", () => {
    const card = {
      body: {
        tag: "body",
        property: {
          elements: [
            { tag: "code_block", property: { language: "bash", contents: [{ contents: [{ content: "ls" }] }] } }
          ]
        }
      }
    };
    expect(extractInteractiveCardText(JSON.stringify(card))).toBe("```bash\nls```");
  });

  it("handles raw_card_content wrapper by unwrapping json_card", () => {
    const cardJson = JSON.stringify({
      body: { elements: [{ tag: "markdown", property: { content: "**hello**" } }] }
    });
    const wrapped = JSON.stringify({ json_card: cardJson });
    expect(extractInteractiveCardText(wrapped)).toBe("**hello**");
  });

  it("falls back to legacy header+elements format", () => {
    const card = {
      header: { title: { content: "Status" } },
      elements: [{ tag: "text", text: "Running" }]
    };
    expect(extractInteractiveCardText(JSON.stringify(card))).toBe("Status\nRunning");
  });

  it("returns placeholder text when the card has no extractable content", () => {
    expect(extractInteractiveCardText("not json")).toBe("[interactive card]");
    expect(extractInteractiveCardText("{}")).toBe("[interactive card]");
  });
});
