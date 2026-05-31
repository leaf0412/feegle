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

  it("registers the requirement workflow stores-phase provision", () => {
    const plugins = defaultPlugins({
      feegleHome: "/tmp/feegle",
      feishuClient: {} as never,
      cloudDoc: {} as never,
      runtimeFactory: (() => ({ start: async () => {}, stop: async () => {} })) as never
    });

    const requirementPlugin = plugins.find((plugin) => plugin.id === "requirement-workflow");
    expect(requirementPlugin).toBeDefined();
    expect(requirementPlugin?.provides?.some((provision) => provision.phase === "stores")).toBe(true);
  });
});
