import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { AllowCommandHandler } from "./agent/allow-command.js";
import { MemoryCommandHandler } from "./agent/memory-command.js";
import { ModeCommandHandler } from "./agent/mode-command.js";
import { ModelCommandHandler } from "./agent/model-command.js";
import { QuietCommandHandler } from "./agent/quiet-command.js";
import { ReasoningCommandHandler } from "./agent/reasoning-command.js";

const quietDefinition = defineSlashCommand("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet");
const modelDefinition = defineSlashCommand("model", "/model", "切换模型", "agent", "nav:/model");
const reasoningDefinition = defineSlashCommand("reasoning", "/reasoning", "切换推理强度", "agent", "nav:/reasoning");
const modeDefinition = defineSlashCommand("mode", "/mode", "切换运行模式", "agent", "nav:/mode");
const memoryDefinition = defineSlashCommand("memory", "/memory", "管理记忆", "agent", "cmd:/memory");
const allowDefinition = defineSlashCommand("allow", "/allow", "授权工具权限", "agent", "cmd:/allow");

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
        const providerDeps = { providers: deps.providers, providerStore: deps.providerStore };
        registry.registerCommand(modelDefinition, new ModelCommandHandler(providerDeps));
        registry.registerCommand(reasoningDefinition, new ReasoningCommandHandler(providerDeps));
        registry.registerCommand(modeDefinition, new ModeCommandHandler(providerDeps));
        registry.registerCommand(memoryDefinition, new MemoryCommandHandler(providerDeps));
        registry.registerCommand(allowDefinition, new AllowCommandHandler(providerDeps));
      } else {
        registry.declarePlanned(modelDefinition);
        registry.declarePlanned(reasoningDefinition);
        registry.declarePlanned(modeDefinition);
        registry.declarePlanned(memoryDefinition);
        registry.declarePlanned(allowDefinition);
      }
    }
  };
}
