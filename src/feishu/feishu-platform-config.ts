export type FeishuProgressStyle = "legacy" | "compact" | "card";

export interface FeishuPlatformConfig {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  botOpenId?: string;
  enableInteractiveCards: boolean;
  allowFrom: string;
  allowChat: string;
  groupOnly: boolean;
  groupReplyAll: boolean;
  shareSessionInChannel: boolean;
  threadIsolation: boolean;
  replyToTrigger: boolean;
  progressStyle: FeishuProgressStyle;
  reactionEmoji?: string;
  doneEmoji?: string;
}

export interface FeishuPlatformConfigInput {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  botOpenId?: string;
  enableInteractiveCards: boolean;
  allowFrom: string;
  allowChat: string;
  groupOnly: boolean;
  groupReplyAll: boolean;
  shareSessionInChannel: boolean;
  threadIsolation: boolean;
  replyToTrigger: boolean;
  progressStyle: FeishuProgressStyle;
  reactionEmoji: string;
  doneEmoji?: string;
}

export function parseFeishuPlatformConfig(input: FeishuPlatformConfigInput): FeishuPlatformConfig {
  return {
    appId: input.appId,
    appSecret: input.appSecret,
    verificationToken: input.verificationToken,
    encryptKey: input.encryptKey,
    botOpenId: input.botOpenId,
    enableInteractiveCards: input.enableInteractiveCards,
    allowFrom: input.allowFrom,
    allowChat: input.allowChat,
    groupOnly: input.groupOnly,
    groupReplyAll: input.groupReplyAll,
    shareSessionInChannel: input.shareSessionInChannel,
    threadIsolation: input.threadIsolation,
    replyToTrigger: input.replyToTrigger,
    progressStyle: input.progressStyle,
    reactionEmoji: input.reactionEmoji === "none" ? undefined : input.reactionEmoji,
    doneEmoji: input.doneEmoji === "none" ? undefined : input.doneEmoji
  };
}
