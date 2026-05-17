import { describe, expect, it } from "vitest";
import { renderFeishuCard } from "../../src/feishu/feishu-card-renderer.js";
import { createPlatformCard } from "../../src/platform/platform-card.js";

describe("renderFeishuCard", () => {
  it("renders equal-width action buttons as column_set", () => {
    const card = createPlatformCard()
      .buttonRow(
        [
          { text: "确认", type: "primary", action: "act:/plan confirm" },
          { text: "取消", type: "danger", action: "act:/requirement cancel" }
        ],
        "equal_columns"
      )
      .build();

    const rendered = renderFeishuCard(card, "feishu:oc_1:channel");

    expect(JSON.stringify(rendered)).toContain("column_set");
    expect(JSON.stringify(rendered)).toContain("act:/plan confirm");
    expect(JSON.stringify(rendered)).toContain("feishu:oc_1:channel");
  });

  it("renders list items with right-side buttons", () => {
    const card = createPlatformCard()
      .listItem("**web-app**：等待推送", {
        text: "推送",
        type: "primary",
        action: "act:/push repo web"
      })
      .build();

    const rendered = renderFeishuCard(card);

    expect(JSON.stringify(rendered)).toContain("web-app");
    expect(JSON.stringify(rendered)).toContain("act:/push repo web");
  });
});
