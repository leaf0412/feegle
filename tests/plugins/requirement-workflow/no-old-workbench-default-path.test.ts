import { describe, expect, it } from "vitest";
import { defaultPlugins } from "@infra/boot/default-plugins.js";

describe("old workbench runtime removal guard", () => {
  it("does not include workbench runtime contribution in default plugins", () => {
    const plugins = defaultPlugins({
      feegleHome: "/tmp/feegle",
      feishuClient: {} as never,
      cloudDoc: {} as never,
      runtimeFactory: (() => ({ start: async () => {}, stop: async () => {} })) as never
    });
    const contributionIds = plugins.flatMap((plugin) => plugin.runtimeContributions ?? []).map((item) => item.id);
    expect(contributionIds).not.toContain("workbench-runtime");
    expect(contributionIds).toContain("requirement-workflow-runtime");
  });
});
