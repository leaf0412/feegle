import type { FeishuCommandHandler } from "../feishu/feishu-long-connection-runtime.js";
import { parseFeishuCommand } from "../feishu/feishu-gateway.js";
import type { PlatformIncomingMessage } from "./platform-message.js";
import type { PlatformMessageHandler } from "./platform-port.js";

export function createPlatformCommandHandler(legacyHandler: FeishuCommandHandler): PlatformMessageHandler {
  return {
    async handleMessage(message: PlatformIncomingMessage): Promise<void> {
      await legacyHandler.handleCommand({
        source: "message",
        chatId: message.chatId,
        messageId: message.id,
        command: parseFeishuCommand(message.text)
      });
    }
  };
}
