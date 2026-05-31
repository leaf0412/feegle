import { describe, expect, it } from "vitest";
import { createPlatformCommandHandler } from "@platform/platform-command-handler.js";
import type { PlatformIncomingMessage } from "@platform/platform-message.js";

describe("createPlatformCommandHandler", () => {
  it("adapts platform messages to legacy command responder input", async () => {
    const calls: unknown[] = [];
    const handler = createPlatformCommandHandler({
      async handleCommand(input) {
        calls.push(input);
      }
    });

    const message: PlatformIncomingMessage = {
      id: "om_1",
      platform: "feishu",
      sessionKey: "feishu:oc_1:channel",
      chatId: "oc_1",
      senderId: "ou_1",
      text: "/repo select web",
      timestamp: new Date("2026-05-17T10:00:00.000Z"),
      raw: {}
    };

    await handler.handleMessage(message);

    expect(calls).toEqual([
      {
        source: "message",
        chatId: "oc_1",
        messageId: "om_1",
        command: { type: "repo_select", repositoryIds: ["web"] }
      }
    ]);
  });
});
