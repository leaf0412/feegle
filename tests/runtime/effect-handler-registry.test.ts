import { describe, expect, it } from "vitest";
import { EffectHandlerRegistry } from "../../src/runtime/effect-handler-registry.js";

describe("EffectHandlerRegistry", () => {
  it("dispatches effects by plugin id and effect type", async () => {
    const registry = new EffectHandlerRegistry();
    registry.register({
      pluginId: "feishu",
      effectType: "message.reply",
      execute: async (effect) => ({ echoed: effect.input })
    });

    const result = await registry.execute({
      effectId: "eff_1",
      pluginId: "feishu",
      effectType: "message.reply",
      input: { text: "ok" }
    });

    expect(result).toEqual({ echoed: { text: "ok" } });
  });
});
