import type { SlashCommandModule } from "../slash-command-module.js";
import { plannedCommandModule } from "./planned-command-module.js";
import { providerCommandModule } from "./provider-command-module.js";
import { repoCommandModule } from "./repo-command-module.js";
import { schedulerCommandModule } from "./scheduler-command-module.js";
import { systemCommandModule } from "./system-command-module.js";

const defaultModuleFactories = [
  plannedCommandModule,
  systemCommandModule,
  repoCommandModule,
  schedulerCommandModule,
  providerCommandModule
];

export function defaultSlashCommandModules(): SlashCommandModule[] {
  return defaultModuleFactories.map((createModule) => createModule());
}
