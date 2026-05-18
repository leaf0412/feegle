import type { SlashCommandModule } from "../slash-command-module.js";
import { CommandDetailHandler } from "./command-detail.js";
import { HelpCommandHandler } from "./help-command.js";

export function systemCommandModule(): SlashCommandModule {
  return {
    id: "system",
    register: (registry, deps) => {
      const handlerDeps = { ownerIdentities: deps.ownerIdentities };
      registry.register(new HelpCommandHandler(registry, handlerDeps));
      registry.register(new CommandDetailHandler(registry, handlerDeps));
    }
  };
}
