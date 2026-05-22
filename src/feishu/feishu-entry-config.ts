import { parseFeishuPlatformConfig, type FeishuPlatformConfig } from "./feishu-platform-config.js";
import type { FeishuClientPort } from "./feishu-client.js";

export interface FeishuEntryEnv {
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_VERIFICATION_TOKEN?: string;
  FEISHU_ENCRYPT_KEY?: string;
  FEISHU_BOT_OPEN_ID?: string;
  FEISHU_ENABLE_INTERACTIVE_CARDS?: string;
  FEISHU_ALLOW_FROM?: string;
  FEISHU_ALLOW_CHAT?: string;
  FEISHU_GROUP_ONLY?: string;
  FEISHU_GROUP_REPLY_ALL?: string;
  FEISHU_SHARE_SESSION_IN_CHANNEL?: string;
  FEISHU_THREAD_ISOLATION?: string;
  FEISHU_REPLY_TO_TRIGGER?: string;
  FEISHU_PROGRESS_STYLE?: string;
}

export function buildFeishuEntryConfig(env: FeishuEntryEnv): FeishuPlatformConfig {
  return parseFeishuPlatformConfig({
    appId: readRequiredEnv(env, "FEISHU_APP_ID"),
    appSecret: readRequiredEnv(env, "FEISHU_APP_SECRET"),
    verificationToken: env.FEISHU_VERIFICATION_TOKEN,
    encryptKey: env.FEISHU_ENCRYPT_KEY,
    botOpenId: env.FEISHU_BOT_OPEN_ID,
    enableInteractiveCards: readBooleanEnv(env, "FEISHU_ENABLE_INTERACTIVE_CARDS"),
    allowFrom: env.FEISHU_ALLOW_FROM,
    allowChat: env.FEISHU_ALLOW_CHAT,
    groupOnly: readBooleanEnv(env, "FEISHU_GROUP_ONLY"),
    groupReplyAll: readBooleanEnv(env, "FEISHU_GROUP_REPLY_ALL"),
    shareSessionInChannel: readBooleanEnv(env, "FEISHU_SHARE_SESSION_IN_CHANNEL"),
    threadIsolation: readBooleanEnv(env, "FEISHU_THREAD_ISOLATION"),
    replyToTrigger: readBooleanEnv(env, "FEISHU_REPLY_TO_TRIGGER"),
    progressStyle: env.FEISHU_PROGRESS_STYLE
  });
}

export async function resolveFeishuEntryConfig(
  env: FeishuEntryEnv,
  client: Pick<FeishuClientPort, "fetchBotOpenId">
): Promise<FeishuPlatformConfig> {
  const config = buildFeishuEntryConfig(env);
  if (config.botOpenId) {
    return config;
  }
  const botOpenId = await client.fetchBotOpenId();
  if (!botOpenId) {
    throw new Error("Feishu bot info response missing open_id");
  }
  return { ...config, botOpenId };
}

function readRequiredEnv(env: FeishuEntryEnv, name: keyof FeishuEntryEnv): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBooleanEnv(env: FeishuEntryEnv, name: keyof FeishuEntryEnv): boolean | undefined {
  const value = env[name];
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`Invalid ${name}: ${value}`);
}
