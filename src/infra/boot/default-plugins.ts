import type { FeeglePlugin } from "./feegle-plugin.js";
import type { Startable } from "../app/feegle-app.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { FeishuCommandHandler, FeishuRuntimeIngress } from "@integrations/feishu/feishu-long-connection-runtime.js";
import { corePlugin } from "@plugins/core/core-plugin.js";
import { stockPlugin } from "@plugins/stock/stock-plugin.js";
import { gitlabFollowPlugin } from "@plugins/gitlab-follow/gitlab-follow-plugin.js";
import { webhookPlugin } from "@plugins/webhook/webhook-plugin.js";
import { requirementWorkflowPlugin } from "@plugins/requirement-workflow/requirement-workflow-plugin.js";
import { createFeishuPlugin } from "@plugins/feishu/feishu-plugin.js";

export interface DefaultPluginDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler, ingress?: FeishuRuntimeIngress) => Startable;
}

export function defaultPlugins(deps: DefaultPluginDeps): FeeglePlugin[] {
  return [
    corePlugin,
    webhookPlugin,
    stockPlugin,
    gitlabFollowPlugin,
    requirementWorkflowPlugin,
    createFeishuPlugin({
      feegleHome: deps.feegleHome,
      feishuClient: deps.feishuClient,
      cloudDoc: deps.cloudDoc,
      runtimeFactory: deps.runtimeFactory
    })
  ];
}
