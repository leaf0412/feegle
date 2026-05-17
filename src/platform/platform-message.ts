export type PlatformKind = "feishu" | "wecom" | (string & {});

export interface PlatformIncomingMessage {
  id: string;
  platform: PlatformKind;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: Date;
  threadId?: string;
  rootMessageId?: string;
  sessionKey?: string;
  raw: unknown;
}

export interface PlatformReplyContext {
  platform: PlatformKind;
  chatId: string;
  userId: string;
  threadId?: string;
  rootMessageId?: string;
}

export interface PlatformSendResult {
  messageId: string;
}
