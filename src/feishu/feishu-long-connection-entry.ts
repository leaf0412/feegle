import * as lark from "@larksuiteoapi/node-sdk";
import { FeishuClientPort, LarkFeishuClient } from "./feishu-client.js";
import { FeishuLongConnectionRuntime } from "./feishu-long-connection-runtime.js";
import { parseFeishuPlatformConfig } from "./feishu-platform-config.js";
import { buildAgentProviderRegistry } from "../agent/build-agent-provider-registry.js";
import { FeegleApp } from "../app/feegle-app.js";
import { resolveFeegleHome } from "../app/feegle-home.js";
import { parseOwnerIdentities } from "../app/owner-identities.js";

const config = parseFeishuPlatformConfig({
  appId: readRequiredEnv("FEISHU_APP_ID"),
  appSecret: readRequiredEnv("FEISHU_APP_SECRET"),
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
  encryptKey: process.env.FEISHU_ENCRYPT_KEY,
  botOpenId: process.env.FEISHU_BOT_OPEN_ID,
  enableInteractiveCards: readBooleanEnv("FEISHU_ENABLE_INTERACTIVE_CARDS"),
  allowFrom: process.env.FEISHU_ALLOW_FROM,
  allowChat: process.env.FEISHU_ALLOW_CHAT,
  groupOnly: readBooleanEnv("FEISHU_GROUP_ONLY"),
  groupReplyAll: readBooleanEnv("FEISHU_GROUP_REPLY_ALL"),
  shareSessionInChannel: readBooleanEnv("FEISHU_SHARE_SESSION_IN_CHANNEL"),
  threadIsolation: readBooleanEnv("FEISHU_THREAD_ISOLATION"),
  replyToTrigger: readBooleanEnv("FEISHU_REPLY_TO_TRIGGER"),
  progressStyle: process.env.FEISHU_PROGRESS_STYLE
});
const feishuClient: FeishuClientPort = new LarkFeishuClient(
  new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret
  })
);
const providers = buildAgentProviderRegistry(process.env);
const app = new FeegleApp({
  feegleHome: resolveFeegleHome(process.env),
  ownerIdentities: parseOwnerIdentities(process.env.FEEGLE_OWNER_IDENTITIES),
  feishuClient,
  agentProviders: providers,
  runtimeFactory: (handler) => new FeishuLongConnectionRuntime(config, lark, handler)
});

await app.start();

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name];
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
