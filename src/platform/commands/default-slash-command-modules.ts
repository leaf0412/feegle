import type { SlashCommandModule } from "../slash-command-module.js";
import { repoCommandModule } from "./repo-command-module.js";
import { schedulerCommandModule } from "./scheduler-command-module.js";
import { systemCommandModule } from "./system-command-module.js";

export function defaultSlashCommandModules(): SlashCommandModule[] {
  return [systemCommandModule(), repoCommandModule(), schedulerCommandModule()];
}
