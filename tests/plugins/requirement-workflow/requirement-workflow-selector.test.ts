import { describe, expect, it } from "vitest";
import { defaultPlugins } from "@infra/boot/default-plugins.js";

describe("default plugins", () => {
  it("loads requirement workflow before platform adapters", () => {
    const plugins = defaultPlugins({
      feegleHome: "/tmp/feegle",
      feishuClient: {} as never,
      cloudDoc: {} as never,
      runtimeFactory: (() => ({ start: async () => {}, stop: async () => {} })) as never
    });

    const ids = plugins.map((plugin) => plugin.id);
    expect(ids).toContain("requirement-workflow");
    expect(ids.indexOf("requirement-workflow")).toBeLessThan(ids.indexOf("feishu"));
  });
});
