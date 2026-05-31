import { describe, expect, it } from "vitest";
import { createFeishuPlugin } from "@plugins/feishu/feishu-plugin.js";

describe("Feishu plugin boundary", () => {
  it("does not register workbench business runtime contributions", () => {
    const plugin = createFeishuPlugin({
      feegleHome: "/tmp/feegle",
      feishuClient: {} as never,
      cloudDoc: {} as never,
      runtimeFactory: (() => ({ start: async () => {}, stop: async () => {} })) as never
    });

    expect(plugin.runtimeContributions?.map((item) => item.id)).not.toContain("workbench-runtime");
  });
});
