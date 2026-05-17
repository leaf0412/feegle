import { describe, expect, it } from "vitest";
import type { PlatformIncomingMessage, PlatformReplyContext } from "../../src/platform/platform-message.js";

describe("PlatformIncomingMessage", () => {
  it("keeps business routing independent from raw platform payloads", () => {
    const message: PlatformIncomingMessage = {
      id: "msg_1",
      platform: "feishu",
      chatId: "chat_1",
      senderId: "user_1",
      text: "/prototype status",
      timestamp: new Date("2026-05-17T10:00:00.000Z"),
      raw: { event: { message: { message_id: "msg_1" } } }
    };

    const replyContext: PlatformReplyContext = {
      platform: message.platform,
      chatId: message.chatId,
      rootMessageId: message.id,
      userId: message.senderId
    };

    expect(replyContext).toEqual({
      platform: "feishu",
      chatId: "chat_1",
      rootMessageId: "msg_1",
      userId: "user_1"
    });
    expect(message.raw).toEqual({ event: { message: { message_id: "msg_1" } } });
  });
});
