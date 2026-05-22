import { describe, expect, it } from "vitest";
import { buildFeishuEntryConfig, resolveFeishuEntryConfig } from "../../src/feishu/feishu-entry-config.js";

describe("buildFeishuEntryConfig", () => {
  it("does not require FEISHU_BOT_OPEN_ID because the entrypoint resolves it from app credentials", () => {
    const config = buildFeishuEntryConfig({
      FEISHU_APP_ID: "cli_xxx",
      FEISHU_APP_SECRET: "secret_xxx"
    });

    expect(config.botOpenId).toBeUndefined();
  });

  it("resolves the bot open id from Feishu when no compatibility override is configured", async () => {
    const calls: string[] = [];
    const config = await resolveFeishuEntryConfig(
      {
        FEISHU_APP_ID: "cli_xxx",
        FEISHU_APP_SECRET: "secret_xxx"
      },
      {
        fetchBotOpenId: async () => {
          calls.push("fetch");
          return "ou_bot";
        }
      }
    );

    expect(config.botOpenId).toBe("ou_bot");
    expect(calls).toEqual(["fetch"]);
  });

  it("keeps an explicit bot open id override for older deployments", async () => {
    const config = await resolveFeishuEntryConfig(
      {
        FEISHU_APP_ID: "cli_xxx",
        FEISHU_APP_SECRET: "secret_xxx",
        FEISHU_BOT_OPEN_ID: "ou_override"
      },
      {
        fetchBotOpenId: async () => {
          throw new Error("fetch should not be called");
        }
      }
    );

    expect(config.botOpenId).toBe("ou_override");
  });
});
