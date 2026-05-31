import { describe, expect, it } from "vitest";
import { createPlatformCard } from "@platform/platform-card.js";

describe("createPlatformCard", () => {
  it("builds a card without platform-specific fields", () => {
    const card = createPlatformCard()
      .title("需求确认", "blue")
      .markdown("请确认原型。")
      .buttonRow([{ text: "确认", type: "primary", action: "act:/prototype approve" }])
      .build();

    expect(card.header).toEqual({ title: "需求确认", color: "blue" });
    expect(JSON.stringify(card)).toContain("act:/prototype approve");
  });
});
