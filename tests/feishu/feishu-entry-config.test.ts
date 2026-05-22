import { describe, expect, it } from "vitest";
import { buildFeishuEntryConfig } from "../../src/feishu/feishu-entry-config.js";

describe("buildFeishuEntryConfig", () => {
  it("requires FEISHU_BOT_OPEN_ID so group mention routing cannot fail silently", () => {
    expect(() =>
      buildFeishuEntryConfig({
        FEISHU_APP_ID: "cli_xxx",
        FEISHU_APP_SECRET: "secret_xxx"
      })
    ).toThrow("Missing required environment variable: FEISHU_BOT_OPEN_ID");
  });

  it("passes the configured bot open id into platform config", () => {
    const config = buildFeishuEntryConfig({
      FEISHU_APP_ID: "cli_xxx",
      FEISHU_APP_SECRET: "secret_xxx",
      FEISHU_BOT_OPEN_ID: "ou_bot"
    });

    expect(config.botOpenId).toBe("ou_bot");
  });
});
