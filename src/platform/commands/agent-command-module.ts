import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { ModelCommandHandler } from "./agent/model-command.js";
import { QuietCommandHandler } from "./agent/quiet-command.js";

const quietDefinition = defineSlashCommand("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet");
const modelDefinition = defineSlashCommand("model", "/model", "切换模型", "agent", "nav:/model");

export function agentCommandModule(): SlashCommandModule {
  return {
    id: "agent",
    register: (registry, deps) => {
      if (deps.sessionStore) {
        registry.registerCommand(
          quietDefinition,
          new QuietCommandHandler({ sessionStore: deps.sessionStore })
        );
      } else {
        registry.declarePlanned(quietDefinition);
      }

      if (deps.providers && deps.providerStore) {
        registry.registerCommand(
          modelDefinition,
          new ModelCommandHandler({
            providers: deps.providers,
            providerStore: deps.providerStore
          })
        );
      } else {
        registry.declarePlanned(modelDefinition);
      }
    }
  };
}
