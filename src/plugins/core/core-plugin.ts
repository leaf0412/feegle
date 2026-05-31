import { join } from "node:path";
import type { BootPhaseName } from "@infra/boot/boot-phase.js";
import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import { ArtifactService } from "@core/artifacts/artifact-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";
import { ControlActionStore } from "@core/control/control-action-store.js";
import { MemoryStore } from "@core/memory/memory-store.js";
import { RecoveryService } from "@core/recovery/recovery-service.js";
import { createRecoveryWorkflow } from "@core/recovery/recovery-workflow.js";
import { defaultSlashCommandModules } from "@platform/commands/default-slash-command-modules.js";
import { agentPromptKindModule, heartbeatKindModule } from "@features/scheduler/default-handler-kind-modules.js";
import { agentConversationRuntimeContribution } from "@core/agent-conversation/agent-conversation-runtime-contribution.js";
import { schedulerWorkflowContribution } from "@features/scheduler/scheduler-workflow-contribution.js";

export const corePlugin: FeeglePlugin = {
  id: "core",
  manifest: {
    id: "core",
    version: "1.0.0",
    displayName: "Core",
    description: "Heartbeat, agent prompts, recovery workflows, and system commands",
    triggerTypes: ["heartbeat"],
    effectTypes: [{ pluginId: "core", effectType: "agent_prompt" }],
    controlActionTypes: ["system_commands"],
    permissions: ["schedule_tasks", "run_agent_prompts"]
  },
  handlerKinds: [heartbeatKindModule(), agentPromptKindModule()],
  slashCommands: defaultSlashCommandModules(),
  runtimeContributions: [schedulerWorkflowContribution(), agentConversationRuntimeContribution()],
  provides: [
    {
      phase: "stores" as BootPhaseName,
      run: (ctx) => {
        const db = ctx.require("runtimeDb");
        const artifactStore = new ArtifactStore(db);
        const artifactsDir = join(process.env.HOME ?? "/tmp", ".feegle", "artifacts");
        const recoveryService = new RecoveryService(
          new ArtifactService(artifactStore, artifactsDir),
          ctx.require("runtimeStore"),
          artifactStore,
          new MemoryStore(db)
        );

        ctx.require("workflowRegistry").register(
          createRecoveryWorkflow({
            recoveryService,
            memoryStore: new MemoryStore(db),
            controlActionStore: new ControlActionStore(db)
          })
        );
      }
    }
  ]
};
