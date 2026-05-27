import type { CapabilityContext } from "../../boot/boot-context.js";
import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import type { Startable } from "../../app/feegle-app.js";
import { GitService } from "../../git/git-service.js";
import type { FeishuClientPort } from "../../feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "../../feishu/feishu-cloud-doc-client.js";
import type { FeishuCommandHandler } from "../../feishu/feishu-long-connection-runtime.js";
import { FeishuChatHandler } from "../../feishu/feishu-chat-handler.js";
import {
  FeishuCommandResponder,
  logFeishuCommandTrace,
  type FeishuWorkbenchHandler
} from "../../feishu/feishu-command-responder.js";
import { FeishuUserDirectory } from "../../feishu/feishu-user-directory.js";
import {
  buildPlanExecutionRevisionCard,
  buildPlanRevisionRequestCard
} from "../../feishu/feishu-workbench-cards.js";
import type { AgentProviderRegistry } from "../../agent/agent-provider-registry.js";
import { resolveWorkspaceDir } from "../../app/workspace-dir.js";
import { PlanArtifactService } from "../../workbench/plan-artifact-service.js";
import type { PlanArtifactStore } from "../../workbench/plan-artifact-store.js";
import { PlanExecutionService } from "../../workbench/plan-execution-service.js";

export interface FeishuPluginDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
}

export function createFeishuPlugin(deps: FeishuPluginDeps): FeeglePlugin {
  return {
    id: "feishu",
    provides: [
      {
        phase: "providers",
        run: (ctx) => ctx.provide("userDirectory", new FeishuUserDirectory(deps.feishuClient))
      }
    ],
    platformRuntimes: [
      {
        id: "feishu-long-connection",
        create: (ctx) => buildFeishuRuntime(deps, ctx)
      }
    ]
  };
}

function buildFeishuRuntime(deps: FeishuPluginDeps, ctx: CapabilityContext): Startable {
  const cap = ctx.pick(
    "configStore",
    "taskRegistry",
    "userDirectory",
    "slashCommands",
    "agents",
    "sessionStore",
    "chatHistory",
    "planArtifactStore"
  );
  const config = cap.configStore.get();
  const chatHandler = new FeishuChatHandler({
    client: deps.feishuClient,
    providers: cap.agents,
    history: cap.chatHistory,
    sessionStore: cap.sessionStore,
    workspaceDir: resolveWorkspaceDir(deps.feegleHome, config.defaultWorkspace)
  });
  const planArtifacts = new PlanArtifactService({
    feegleHome: deps.feegleHome,
    client: deps.feishuClient,
    cloudDoc: deps.cloudDoc,
    store: cap.planArtifactStore
  });
  const planExecution = new PlanExecutionService({
    feegleHome: deps.feegleHome,
    client: deps.feishuClient,
    store: cap.planArtifactStore,
    git: new GitService(),
    agent: cap.agents.resolveActiveAgent() ?? {
      runDevelopmentTask: async () => {
        throw new Error("no active agent provider configured for plan execution");
      }
    }
  });
  const responder = new FeishuCommandResponder(deps.feishuClient, {
    registry: cap.slashCommands,
    chatHandler,
    trace: logFeishuCommandTrace,
    configStore: cap.configStore,
    taskRegistry: cap.taskRegistry,
    userDirectory: cap.userDirectory,
    workbench: buildWorkbenchHandlers({
      planArtifactStore: cap.planArtifactStore,
      agents: cap.agents,
      planArtifacts,
      planExecution
    })
  });
  return deps.runtimeFactory(responder);
}

interface WorkbenchHandlerDeps {
  planArtifactStore: PlanArtifactStore;
  agents: AgentProviderRegistry;
  planArtifacts: PlanArtifactService;
  planExecution: PlanExecutionService;
}

function buildWorkbenchHandlers(deps: WorkbenchHandlerDeps): FeishuWorkbenchHandler {
  const { planArtifactStore, agents, planArtifacts, planExecution } = deps;
  return {
    handlePlanRevise: async (input) => ({
      kind: "feishu_card_update",
      card: buildPlanRevisionRequestCard(input.command)
    }),
    handlePlanRevisionSubmit: async (input) => {
      const current = planArtifactStore.latest(input.command.planId);
      if (!current) {
        return { kind: "text", text: `计划不存在：${input.command.planId}` };
      }
      const provider = agents.resolve(current.provider);
      if (!provider) {
        return { kind: "text", text: `计划使用的 agent provider 不存在：${current.provider}` };
      }
      const artifact = await planArtifacts.revisePlan({
        planId: input.command.planId,
        revisionNote: input.command.revisionNote,
        agent: provider.buildAgent()
      });
      return { kind: "text", text: `已生成计划 v${artifact.version}，请查看新文件和确认卡。` };
    },
    handlePlanApprove: (input) => planExecution.approve(input.command.planId),
    handlePlanCancel: (input) => planExecution.cancel(input.command.planId),
    handlePlanReject: (input) => planExecution.cancel(input.command.planId),
    handlePlanPush: (input) => planExecution.push(input.command.planId),
    handlePlanCleanup: (input) => planExecution.cleanup(input.command.planId),
    handlePlanBaseBranchSubmit: (input) =>
      planExecution.submitBaseBranch({
        planId: input.command.planId,
        baseBranch: input.command.baseBranch,
        ...(input.command.headBranch ? { headBranch: input.command.headBranch } : {})
      }),
    handlePlanReviseExecution: async (input) => ({
      kind: "feishu_card",
      card: buildPlanExecutionRevisionCard({
        planId: input.command.planId,
        version: planArtifactStore.latest(input.command.planId)?.version ?? input.command.version,
        iteration: planArtifactStore.latest(input.command.planId)?.executionIteration ?? 1
      })
    }),
    handlePlanReviseExecutionSubmit: (input) =>
      planExecution.reviseExecution(input.command.planId, input.command.note)
  };
}
