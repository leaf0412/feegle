import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { CurrentCommandHandler } from "./session/current-command.js";
import { NewCommandHandler } from "./session/new-command.js";

const newDefinition = defineSlashCommand("new", "/new", "创建新会话", "session", "act:/new");
const currentDefinition = defineSlashCommand("current", "/current", "查看当前会话", "session", "nav:/current");

export function sessionCommandModule(): SlashCommandModule {
  return {
    id: "session",
    register: (registry, deps) => {
      if (deps.sessionStore && deps.chatHistory && deps.providers) {
        registry.registerCommand(
          newDefinition,
          new NewCommandHandler({
            sessionStore: deps.sessionStore,
            chatHistory: deps.chatHistory,
            providers: deps.providers
          })
        );
        registry.registerCommand(
          currentDefinition,
          new CurrentCommandHandler({
            sessionStore: deps.sessionStore,
            chatHistory: deps.chatHistory
          })
        );
      } else {
        registry.declarePlanned(newDefinition);
        registry.declarePlanned(currentDefinition);
      }
    }
  };
}
