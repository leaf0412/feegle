import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { AllowCommandHandler } from "./agent/allow-command.js";
import { MemoryCommandHandler } from "./agent/memory-command.js";
import { ModeCommandHandler } from "./agent/mode-command.js";
import { ModelCommandHandler } from "./agent/model-command.js";
import { QuietCommandHandler } from "./agent/quiet-command.js";
import { ReasoningCommandHandler } from "./agent/reasoning-command.js";
import { CommandsCommandHandler } from "./workspace/commands-command.js";
import { CompressCommandHandler } from "./workspace/compress-command.js";
import { ShellCommandHandler } from "./workspace/shell-command.js";
import { ShowCommandHandler } from "./workspace/show-command.js";
import { SkillsCommandHandler } from "./workspace/skills-command.js";
import { StopCommandHandler } from "./workspace/stop-command.js";

const quietDefinition = defineSlashCommand("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet");
const modelDefinition = defineSlashCommand("model", "/model", "切换模型", "agent", "nav:/model");
const reasoningDefinition = defineSlashCommand("reasoning", "/reasoning", "切换推理强度", "agent", "nav:/reasoning");
const modeDefinition = defineSlashCommand("mode", "/mode", "切换运行模式", "agent", "nav:/mode");
const memoryDefinition = defineSlashCommand("memory", "/memory", "管理记忆", "agent", "cmd:/memory");
const allowDefinition = defineSlashCommand("allow", "/allow", "授权工具权限", "agent", "cmd:/allow");
const stopDefinition = defineSlashCommand("stop", "/stop", "中止当前会话", "session", "act:/stop");
const showDefinition = defineSlashCommand("show", "/show", "展示文件或结果", "knowledge", "cmd:/show");
const commandsDefinition = defineSlashCommand("commands", "/commands", "管理自定义命令", "setup", "nav:/commands");
const skillsDefinition = defineSlashCommand("skills", "/skills", "查看技能目录", "setup", "nav:/skills");
const compressDefinition = defineSlashCommand("compress", "/compress", "压缩上下文", "knowledge", "cmd:/compress");
const shellDefinition = defineSlashCommand("shell", "/shell", "执行 shell 工具", "knowledge", "cmd:/shell");

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
        registry.registerCommand(compressDefinition, new CompressCommandHandler({ providers: deps.providers }));
      } else {
        registry.declarePlanned(modelDefinition);
        registry.declarePlanned(reasoningDefinition);
        registry.declarePlanned(modeDefinition);
        registry.declarePlanned(memoryDefinition);
        registry.declarePlanned(allowDefinition);
        registry.declarePlanned(compressDefinition);
      }

      registry.registerCommand(stopDefinition, new StopCommandHandler());
      registry.registerCommand(showDefinition, new ShowCommandHandler({ ownerEmails: deps.ownerEmails }));

      if (deps.providers && deps.providerStore) {
        registry.registerCommand(
          shellDefinition,
          new ShellCommandHandler({
            providers: deps.providers,
            providerStore: deps.providerStore,
            ownerEmails: deps.ownerEmails
          })
        );
      } else {
        registry.declarePlanned(shellDefinition);
      }

      if (deps.feegleHome) {
        registry.registerCommand(commandsDefinition, new CommandsCommandHandler({ feegleHome: deps.feegleHome }));
        registry.registerCommand(skillsDefinition, new SkillsCommandHandler({ feegleHome: deps.feegleHome }));
      } else {
        registry.declarePlanned(commandsDefinition);
        registry.declarePlanned(skillsDefinition);
      }
    }
  };
}
