import * as lark from "@larksuiteoapi/node-sdk";
import { FeishuClientPort, LarkFeishuClient } from "./feishu-client.js";
import { HttpFeishuCloudDocClient } from "./feishu-cloud-doc-client.js";
import { FeishuLongConnectionRuntime } from "./feishu-long-connection-runtime.js";
import { buildFeishuEntryConfig, resolveFeishuEntryConfig } from "./feishu-entry-config.js";
import { FeegleApp } from "../../infra/app/feegle-app.js";
import { ConfigStore } from "../../infra/app/config-store.js";
import { resolveFeegleHome } from "../../infra/app/feegle-home.js";
import { normalizeOwnerEmails } from "../../infra/app/owner-emails.js";
import { installConsoleTimestamps } from "../../infra/app/console-timestamps.js";

installConsoleTimestamps();

const feegleHome = resolveFeegleHome(process.env);
const configStore = await ConfigStore.load(feegleHome);
const config = configStore.get();
if (!config.feishu) {
  throw new Error("Missing [feishu] section in ~/.feegle/config.jsonc");
}

const baseConfig = buildFeishuEntryConfig(config.feishu);
const feishuOpenApiClient = new lark.Client({
  appId: baseConfig.appId,
  appSecret: baseConfig.appSecret
});
const feishuClient: FeishuClientPort = new LarkFeishuClient(feishuOpenApiClient);
const resolvedConfig = await resolveFeishuEntryConfig(config.feishu, feishuClient);
const cloudDoc = new HttpFeishuCloudDocClient({
  request: (payload) => {
    if (!feishuOpenApiClient.request) {
      throw new Error("Feishu open-api client missing raw request(); cloud doc API unavailable");
    }
    return feishuOpenApiClient.request(payload);
  }
});
const app = new FeegleApp({
  feegleHome,
  ownerEmails: normalizeOwnerEmails(config.ownerEmails),
  feishuClient,
  cloudDoc,
  loadConfigStore: async () => configStore,
  runtimeFactory: (handler) => new FeishuLongConnectionRuntime(resolvedConfig, lark, handler)
});

await app.start();
