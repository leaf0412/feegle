import { describe, expect, it } from "vitest";
import { buildDirectorySetupCard, buildPlanReviewCard } from "../../src/feishu/feishu-workbench-cards.js";

describe("buildDirectorySetupCard", () => {
  it("renders a directory setup form with workspace select and manual path input", () => {
    const card = buildDirectorySetupCard({
      interactionId: "pi_1",
      providers: ["codex", "claude"],
      workspaces: [{ label: "feegle", path: "/repo/feegle" }]
    });

    const json = JSON.stringify(card);

    expect(json).toContain("form");
    expect(json).toContain("input");
    expect(json).toContain("select_static");
    expect(json).toContain("act:/workbench directory submit");
    expect(json).toContain("provider");
    expect(json).toContain("workspace_path");
    expect(json).toContain("manual_path");
  });

  it("renders a compact plan review card with approval actions", () => {
    const card = buildPlanReviewCard({
      planId: "plan_1",
      title: "Fix startup",
      version: 1,
      summary: { steps: 2, risks: ["unknown env"] }
    });

    const json = JSON.stringify(card);

    expect(json).toContain("Fix startup");
    expect(json).toContain("unknown env");
    expect(json).toContain("act:/workbench plan approve");
    expect(json).toContain("act:/workbench plan revise");
    expect(json).toContain("act:/workbench plan cancel");
    expect(json).toContain("\"plan_id\":\"plan_1\"");
    expect(json).toContain("\"version\":\"1\"");
  });
});
