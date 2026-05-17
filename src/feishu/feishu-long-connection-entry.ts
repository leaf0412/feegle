import * as lark from "@larksuiteoapi/node-sdk";
import { FeishuLongConnectionRuntime, type FeishuCommandHandler } from "./feishu-long-connection-runtime.js";

const handler: FeishuCommandHandler = {
  async handleCommand(input) {
    console.log(JSON.stringify(input));
  }
};

const runtime = new FeishuLongConnectionRuntime(
  {
    appId: readRequiredEnv("FEISHU_APP_ID"),
    appSecret: readRequiredEnv("FEISHU_APP_SECRET"),
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    encryptKey: process.env.FEISHU_ENCRYPT_KEY
  },
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
