import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import { defaultSlashCommandModules } from "../../platform/commands/default-slash-command-modules.js";
import { agentPromptKindModule, heartbeatKindModule } from "../../scheduler/default-handler-kind-modules.js";

export const corePlugin: FeeglePlugin = {
  id: "core",
  handlerKinds: [heartbeatKindModule(), agentPromptKindModule()],
  slashCommands: defaultSlashCommandModules()
};
