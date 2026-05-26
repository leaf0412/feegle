import type { FeeglePlugin } from "./feegle-plugin.js";
import type { Startable } from "../app/feegle-app.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "../feishu/feishu-cloud-doc-client.js";
import type { FeishuCommandHandler } from "../feishu/feishu-long-connection-runtime.js";
import { corePlugin } from "../plugins/core/core-plugin.js";
import { stockPlugin } from "../plugins/stock/stock-plugin.js";
import { gitlabFollowPlugin } from "../plugins/gitlab-follow/gitlab-follow-plugin.js";
import { createFeishuPlugin } from "../plugins/feishu/feishu-plugin.js";

export interface DefaultPluginDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
}

export function defaultPlugins(deps: DefaultPluginDeps): FeeglePlugin[] {
  return [
    corePlugin,
    stockPlugin,
    gitlabFollowPlugin,
    createFeishuPlugin({
      feegleHome: deps.feegleHome,
      feishuClient: deps.feishuClient,
      cloudDoc: deps.cloudDoc,
      runtimeFactory: deps.runtimeFactory
    })
  ];
}
