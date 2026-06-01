import { randomUUID } from "node:crypto";
import type { CapabilityContext } from "@infra/boot/boot-context.js";
import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import type { Startable } from "@infra/app/feegle-app.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { FeishuCommandHandler, FeishuRuntimeIngress } from "@integrations/feishu/feishu-long-connection-runtime.js";
import {
  FeishuCommandResponder,
  logFeishuCommandTrace
} from "@integrations/feishu/feishu-command-responder.js";
import { FeishuUserDirectory } from "@integrations/feishu/feishu-user-directory.js";
import { WorkbenchStore } from "@features/workbench/workbench-store.js";
import { WorkbenchCardService } from "@features/workbench/workbench-card-service.js";
import { feishuRuntimeContribution } from "./feishu-runtime-contribution.js";

export interface FeishuPluginDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler, ingress?: FeishuRuntimeIngress) => Startable;
}

const NOT_IMPLEMENTED_AGENT = {
  generatePlan: async () => {
    throw new Error("workbench agent.generatePlan not yet implemented");
  },
  revisePlan: async () => {
    throw new Error("workbench agent.revisePlan not yet implemented");
  }
};

export function createFeishuPlugin(deps: FeishuPluginDeps): FeeglePlugin {
  return {
    id: "feishu",
    manifest: {
      id: "feishu",
      version: "1.0.0",
      displayName: "Feishu",
      description: "Feishu long-connection runtime, chat intent resolution, message reply, and card control actions",
      triggerTypes: ["message"],
      effectTypes: [
        { pluginId: "feishu", effectType: "reply" },
        { pluginId: "feishu", effectType: "card.update" }
      ],
      intentKinds: ["chat", "workbench_card", "workbench_action"],
      controlActionTypes: ["card.revise", "card.approve", "card.cancel", "card.push", "card.revision_submit"],
      permissions: ["read_feishu_messages", "send_feishu_messages", "manage_feishu_cards"],
      secretRefs: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
      resourceScopes: ["feishu:im:message", "feishu:im:chat"]
    },
    provides: [
      {
        phase: "providers",
        run: (ctx) => {
          ctx.provide("userDirectory", new FeishuUserDirectory(deps.feishuClient));
          const workbenchStore = new WorkbenchStore(ctx.require("runtimeDb"));
          ctx.provide("workbenchCardService", new WorkbenchCardService({
            store: workbenchStore,
            cloudDoc: deps.cloudDoc,
            requirementIdFactory: () => randomUUID(),
            agent: NOT_IMPLEMENTED_AGENT
          }));
        }
      }
    ],
    platformRuntimes: [
      {
        id: "feishu-long-connection",
        create: (ctx) => buildFeishuRuntime(deps, ctx)
      }
    ],
    runtimeContributions: [feishuRuntimeContribution(deps.feishuClient, deps.cloudDoc)]
  };
}

function buildFeishuRuntime(deps: FeishuPluginDeps, ctx: CapabilityContext): Startable {
  const cap = ctx.pick(
    "configStore",
    "taskRegistry",
    "userDirectory",
    "slashCommands",
    "runtimeIngress"
  );
  const responder = new FeishuCommandResponder(deps.feishuClient, {
    registry: cap.slashCommands,
    trace: logFeishuCommandTrace,
    configStore: cap.configStore,
    taskRegistry: cap.taskRegistry,
    userDirectory: cap.userDirectory
  });
  return deps.runtimeFactory(responder, cap.runtimeIngress);
}
