import * as lark from "@larksuiteoapi/node-sdk";
import { FeishuClientPort, LarkFeishuClient } from "./feishu-client.js";
import { FeishuCommandResponder } from "./feishu-command-responder.js";
import { FeishuLongConnectionRuntime } from "./feishu-long-connection-runtime.js";

const config = {
  appId: readRequiredEnv("FEISHU_APP_ID"),
  appSecret: readRequiredEnv("FEISHU_APP_SECRET"),
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
  encryptKey: process.env.FEISHU_ENCRYPT_KEY
};
const feishuClient: FeishuClientPort = new LarkFeishuClient(
  new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret
  })
);
const handler = new FeishuCommandResponder(feishuClient);

const runtime = new FeishuLongConnectionRuntime(
  config,
  lark,
  handler
);

await runtime.start();

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
