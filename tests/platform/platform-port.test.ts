import { describe, expect, it, vi } from "vitest";
import type { PlatformPort } from "@platform/platform-port.js";

describe("PlatformPort", () => {
  it("defines the boundary adapters need to send text and cards", async () => {
    const port: PlatformPort = {
      sendText: vi.fn(async () => ({ messageId: "text_1" })),
      sendCard: vi.fn(async () => ({ messageId: "card_1" })),
      updateCard: vi.fn(async () => ({ messageId: "card_1" }))
    };

    await expect(
      port.sendText({ platform: "feishu", chatId: "chat_1", userId: "user_1" }, "处理中")
    ).resolves.toEqual({ messageId: "text_1" });

    await expect(
      port.sendCard(
        { platform: "feishu", chatId: "chat_1", userId: "user_1" },
        { header: { title: "进度", color: "blue" }, elements: [] }
      )
    ).resolves.toEqual({ messageId: "card_1" });

    expect(port.sendText).toHaveBeenCalledWith(
      { platform: "feishu", chatId: "chat_1", userId: "user_1" },
      "处理中"
    );
  });
});
