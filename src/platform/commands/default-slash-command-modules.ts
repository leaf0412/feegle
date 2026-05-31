import type { SlashCommandModule } from "../slash-command-module.js";
import { agentCommandModule } from "./agent-command-module.js";
import { glsumCommandModule } from "./glsum/glsum-command-module.js";
import { providerCommandModule } from "./provider-command-module.js";
import { repoCommandModule } from "./repo-command-module.js";
import { runtimeCommandModule } from "./runtime-command-module.js";
import { schedulerCommandModule } from "./scheduler-command-module.js";
import { sessionCommandModule } from "./session-command-module.js";
import { setupCommandModule } from "./setup-command-module.js";
import { systemCommandModule } from "./system-command-module.js";

const defaultModuleFactories = [
  systemCommandModule,
  setupCommandModule,
  sessionCommandModule,
  agentCommandModule,
  repoCommandModule,
  schedulerCommandModule,
  providerCommandModule,
  glsumCommandModule,
  runtimeCommandModule
];

export function defaultSlashCommandModules(): SlashCommandModule[] {
  return defaultModuleFactories.map((createModule) => createModule());
}
