export interface PlatformSessionKeyInput {
  platform: string;
  chatId: string;
  userId: string;
  chatType: "group" | "p2p" | string;
  shareSessionInChannel?: boolean;
  threadIsolation?: boolean;
  rootMessageId?: string;
}

export function createPlatformSessionKey(input: PlatformSessionKeyInput): string {
  if (input.chatType === "group") {
    if (input.threadIsolation && input.rootMessageId) {
      return `${input.platform}:${input.chatId}:root:${input.rootMessageId}`;
    }
    if (input.shareSessionInChannel) {
      return `${input.platform}:${input.chatId}:channel`;
    }
  }
  return `${input.platform}:${input.chatId}:${input.userId}`;
}
