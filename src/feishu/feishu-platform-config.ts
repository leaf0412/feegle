export type FeishuProgressStyle = "legacy" | "compact" | "card";

export interface FeishuPlatformConfig {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
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
  enableInteractiveCards?: boolean;
  allowFrom?: string;
  allowChat?: string;
  groupOnly?: boolean;
  groupReplyAll?: boolean;
  shareSessionInChannel?: boolean;
  threadIsolation?: boolean;
  replyToTrigger?: boolean;
  progressStyle?: string;
  reactionEmoji?: string;
  doneEmoji?: string;
}

export function parseFeishuPlatformConfig(input: FeishuPlatformConfigInput): FeishuPlatformConfig {
  return {
    appId: input.appId,
    appSecret: input.appSecret,
    verificationToken: input.verificationToken,
    encryptKey: input.encryptKey,
    enableInteractiveCards: input.enableInteractiveCards ?? true,
    allowFrom: input.allowFrom ?? "*",
    allowChat: input.allowChat ?? "*",
    groupOnly: input.groupOnly ?? false,
    groupReplyAll: input.groupReplyAll ?? false,
    shareSessionInChannel: input.shareSessionInChannel ?? false,
    threadIsolation: input.threadIsolation ?? false,
    replyToTrigger: input.replyToTrigger ?? true,
    progressStyle: parseProgressStyle(input.progressStyle),
    reactionEmoji: input.reactionEmoji === "none" ? undefined : input.reactionEmoji ?? "OnIt",
    doneEmoji: input.doneEmoji === "none" ? undefined : input.doneEmoji
  };
}

function parseProgressStyle(value: string | undefined): FeishuProgressStyle {
  if (value === undefined || value === "" || value === "legacy") {
    return "legacy";
  }
  if (value === "compact" || value === "card") {
    return value;
  }
  throw new Error(`Invalid Feishu progress style: ${value}`);
}
