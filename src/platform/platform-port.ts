import type { PlatformCard } from "./platform-card.js";
import type { PlatformReplyContext, PlatformSendResult } from "./platform-message.js";

export interface PlatformPort {
  sendText(context: PlatformReplyContext, text: string): Promise<PlatformSendResult>;
  sendCard(context: PlatformReplyContext, card: PlatformCard): Promise<PlatformSendResult>;
  updateCard(messageId: string, card: PlatformCard): Promise<PlatformSendResult>;
}

export interface PlatformMessageHandler {
  handleMessage(message: import("./platform-message.js").PlatformIncomingMessage): Promise<void>;
}
