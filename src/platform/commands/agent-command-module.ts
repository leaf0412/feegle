import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { QuietCommandHandler } from "./agent/quiet-command.js";

const quietDefinition = defineSlashCommand("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet");

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
    }
  };
}
