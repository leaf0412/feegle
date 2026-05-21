import { describe, expect, it } from "vitest";
import { buildDirectorySetupCard } from "../../src/feishu/feishu-workbench-cards.js";

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
});
