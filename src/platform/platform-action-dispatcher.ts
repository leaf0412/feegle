import type { PlatformCommandAction } from "./platform-action.js";
import {
  extractSlashCommandArgs,
  type SlashCommandReply,
  type SlashCommandRegistryReadView
} from "./slash-command-handler.js";

export interface PlatformActionDispatchContext {
  registry: SlashCommandRegistryReadView;
  dispatchSlash(commandId: string, args: string): Promise<SlashCommandReply | undefined>;
  runDetailHandler(args: string): Promise<SlashCommandReply | undefined>;
}

export type PlatformActionStrategy = (
  action: PlatformCommandAction,
  context: PlatformActionDispatchContext
) => Promise<SlashCommandReply | undefined>;

const dispatchViaRegistry: PlatformActionStrategy = async (action, ctx) => {
  const literal = action.args ? `${action.command} ${action.args}` : action.command;
  const definition = ctx.registry.findByInput(literal);
  if (!definition) {
    return { kind: "text", text: `未知命令：${action.raw}` };
  }
  return ctx.dispatchSlash(definition.id, extractSlashCommandArgs(literal, definition.command));
};

const navStrategy: PlatformActionStrategy = async (action, ctx) => {
  if (action.command === "/help") {
    return ctx.dispatchSlash("help", action.args);
  }
  if (action.command === "/command") {
    return ctx.runDetailHandler(action.args);
  }
  return dispatchViaRegistry(action, ctx);
};

const strategies: Record<PlatformCommandAction["kind"], PlatformActionStrategy> = {
  nav: navStrategy,
  cmd: dispatchViaRegistry,
  act: dispatchViaRegistry
};

export async function dispatchPlatformCommandAction(
  action: PlatformCommandAction,
  context: PlatformActionDispatchContext
): Promise<SlashCommandReply | undefined> {
  return strategies[action.kind](action, context);
}
