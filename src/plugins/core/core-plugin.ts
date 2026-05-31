import { join } from "node:path";
import type { BootPhaseName } from "../../boot/boot-phase.js";
import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import { ArtifactService } from "../../artifacts/artifact-service.js";
import { ArtifactStore } from "../../artifacts/artifact-store.js";
import { ControlActionStore } from "../../control/control-action-store.js";
import { MemoryStore } from "../../memory/memory-store.js";
import { RecoveryService } from "../../recovery/recovery-service.js";
import { createRecoveryWorkflow } from "../../recovery/recovery-workflow.js";
import { defaultSlashCommandModules } from "../../platform/commands/default-slash-command-modules.js";
import { agentPromptKindModule, heartbeatKindModule } from "../../scheduler/default-handler-kind-modules.js";
import { schedulerWorkflowContribution } from "../../scheduler/scheduler-workflow-contribution.js";

export const corePlugin: FeeglePlugin = {
  id: "core",
  handlerKinds: [heartbeatKindModule(), agentPromptKindModule()],
  slashCommands: defaultSlashCommandModules(),
  runtimeContributions: [schedulerWorkflowContribution()],
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
