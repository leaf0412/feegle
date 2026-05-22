import * as lark from "@larksuiteoapi/node-sdk";
import { FeishuClientPort, LarkFeishuClient } from "./feishu-client.js";
import { HttpFeishuCloudDocClient } from "./feishu-cloud-doc-client.js";
import { FeishuLongConnectionRuntime } from "./feishu-long-connection-runtime.js";
import { buildFeishuEntryConfig, resolveFeishuEntryConfig } from "./feishu-entry-config.js";
import { FeegleApp } from "../app/feegle-app.js";
import { resolveFeegleHome } from "../app/feegle-home.js";
import { parseOwnerEmails } from "../app/owner-emails.js";
import { installConsoleTimestamps } from "../app/console-timestamps.js";

installConsoleTimestamps();

const baseConfig = buildFeishuEntryConfig(process.env);
const feishuOpenApiClient = new lark.Client({
  appId: baseConfig.appId,
  appSecret: baseConfig.appSecret
});
const feishuClient: FeishuClientPort = new LarkFeishuClient(feishuOpenApiClient);
const config = await resolveFeishuEntryConfig(process.env, feishuClient);
const cloudDoc = new HttpFeishuCloudDocClient({
  request: (payload) => {
    if (!feishuOpenApiClient.request) {
      throw new Error("Feishu open-api client missing raw request(); cloud doc API unavailable");
    }
    return feishuOpenApiClient.request(payload);
  }
});
const app = new FeegleApp({
  feegleHome: resolveFeegleHome(process.env),
  ownerEmails: parseOwnerEmails(process.env.FEEGLE_OWNER_EMAILS),
  feishuClient,
  cloudDoc,
  runtimeFactory: (handler) => new FeishuLongConnectionRuntime(config, lark, handler)
});

await app.start();
