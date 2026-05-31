import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";
import {
  extractSlashCommandArgs,
  type SlashCommandHandler,
  type SlashCommandReply,
  type SlashCommandRegistry
} from "@platform/slash-command-handler.js";
import { dispatchPlatformCommandAction } from "@platform/platform-action-dispatcher.js";
import type { FeishuUserDirectory } from "./feishu-user-directory.js";
import { deliverSlashReply } from "./feishu-slash-reply-renderer.js";

type FeishuCommandSender = { platform: "feishu"; userId: string; email?: string };

export interface FeishuCommandTraceEvent {
  stage: string;
  source: "message" | "card";
  chatId: string;
  messageId: string;
  commandType: FeishuCommand["type"];
  durationMs?: number;
  detail?: Record<string, unknown>;
}

export type FeishuCommandTraceSink = (event: FeishuCommandTraceEvent) => void;

export function logFeishuCommandTrace(event: FeishuCommandTraceEvent): void {
  const log = event.stage.endsWith("_failed") || event.stage.endsWith("_timeout") ? console.warn : console.info;
  log("Feishu command responder", event);
}

export interface FeishuCommandResponderOptions {
  registry: SlashCommandRegistry;
  trace?: FeishuCommandTraceSink;
  configStore?: { get(): { failureTarget: unknown } };
  taskRegistry?: { list(): ReadonlyArray<{ enabled: boolean }> };
  userDirectory?: FeishuUserDirectory;
}

interface DispatchInput {
  source: "message" | "card";
  chatId: string;
  messageId: string;
  sender?: { platform: "feishu"; userId: string; email?: string };
  sessionKey?: string;
  chatType?: string;
  command: FeishuCommand;
}

/**
 * Routes slash commands through the SlashCommandRegistry.
 *
 * Chat dispatch (Plan 52) and card/workbench dispatch (Plans 53, 58) have been
 * removed — the FeishuLongConnectionRuntime now feeds those through the
 * ingress/runtime instead of this handler.
 *
 * Scheduled for deletion once all slash commands are also cut over.
 */
export class FeishuCommandResponder implements FeishuCommandHandler {
  constructor(
    private readonly client: FeishuClientPort,
    private readonly options: FeishuCommandResponderOptions
  ) {}

  async handleCommand(input: DispatchInput & { shouldRespond?: boolean }): Promise<void> {
    this.trace("received", input);
    if (input.shouldRespond === false) {
      this.trace("skipped_record_only", input);
      return;
    }

    const reply = await this.computeReply(input);
    if (!reply) {
      this.trace("ignored", input);
      return;
    }

    await this.traceAsync("reply", input, () => deliverSlashReply(this.client, input.messageId, reply));
    this.trace("completed", input);
  }

  private async computeReply(input: DispatchInput): Promise<SlashCommandReply | undefined> {
    const command = input.command;
    switch (command.type) {
      case "help":
        return this.dispatchSlashCommand(input, "help", command.groupKey ?? "");
      case "slash_input": {
        const definition = this.options.registry.findByInput(command.raw);
        if (!definition) {
          return { kind: "text", text: `未知命令：${command.raw}` };
        }
        return this.dispatchSlashCommand(input, definition.id, extractSlashCommandArgs(command.raw, definition.command));
      }
      case "slash_command":
        return this.dispatchSlashCommand(input, command.definition.id, extractSlashCommandArgs(command.raw, command.definition.command));
      case "platform_action":
        return this.dispatchPlatformAction(input, command);
      // Following command types are handled by the ingress/runtime — no-op here.
      case "chat":
      case "repo_select":
      case "push_repository":
      case "workbench_plan_revision_submit":
      case "workbench_plan_revise":
      case "workbench_plan_approve":
      case "workbench_plan_cancel":
      case "workbench_plan_reject":
      case "workbench_plan_push":
      case "workbench_plan_cleanup":
      case "workbench_plan_base_branch_submit":
      case "workbench_plan_revise_execution":
      case "workbench_plan_revise_execution_submit":
      case "bind_repo_submit":
      case "bind_repo_cancel":
        return undefined;
      case "unknown":
        return { kind: "text", text: `未知命令：${command.raw}` };
      default: {
        const _exhaustive: never = command;
        return _exhaustive;
      }
    }
  }

  private async dispatchSlashCommand(
    input: DispatchInput,
    commandId: string,
    args: string
  ): Promise<SlashCommandReply | undefined> {
    const definition = this.options.registry.findById(commandId);
    const handler = this.options.registry.resolve(commandId);
    if (!handler || !definition) {
      return {
        kind: "text",
        text: definition
          ? `${definition.command} 仍在规划中，暂未接入执行器。`
          : `未注册的命令：${commandId}`
      };
    }
    const sender = await this.resolveSender(input);
    const context = {
      source: input.source,
      chatId: input.chatId,
      messageId: input.messageId,
      sessionKey: input.sessionKey,
      chatType: input.chatType,
      sender,
      definition,
      raw: definition.command,
      args
    };
    if (handler.canAccess?.(context) === false) {
      return undefined;
    }
    return this.appendFailureTargetBanner(handler, await handler.execute(context));
  }

  private async resolveSender(input: DispatchInput): Promise<{ platform: "feishu"; userId: string; email?: string }> {
    const base = input.sender ?? { platform: "feishu" as const, userId: "" };
    if (!this.options.userDirectory || base.userId === "") {
      return base;
    }
    const email = await this.options.userDirectory.resolveUserEmail(base.userId);
    if (email === "") {
      return base;
    }
    return { ...base, email: email.toLowerCase() };
  }

  private async dispatchPlatformAction(
    input: DispatchInput,
    command: Extract<FeishuCommand, { type: "platform_action" }>
  ): Promise<SlashCommandReply | undefined> {
    const action = command.action;
    if (action.kind !== "nav" && action.kind !== "cmd" && action.kind !== "act") {
      return undefined;
    }
    return dispatchPlatformCommandAction(action, {
      registry: this.options.registry,
      dispatchSlash: (commandId, args) => this.dispatchSlashCommand(input, commandId, args),
      runDetailHandler: (args) => this.runDetailHandler(input, args)
    });
  }

  private async runDetailHandler(input: DispatchInput, args: string): Promise<SlashCommandReply | undefined> {
    const handler: SlashCommandHandler | undefined = this.options.registry.resolve("__command_detail");
    if (!handler) {
      return undefined;
    }
    const sender = await this.resolveSender(input);
    return handler.execute({
      source: input.source,
      chatId: input.chatId,
      messageId: input.messageId,
      sessionKey: input.sessionKey,
      chatType: input.chatType,
      sender,
      definition: {
        id: "__command_detail",
        command: "/command",
        description: "命令详情",
        groupKey: "system",
        action: "nav:/command"
      },
      raw: "/command",
      args
    });
  }

  private appendFailureTargetBanner(handler: SlashCommandHandler, reply: SlashCommandReply): SlashCommandReply {
    if (
      !handler.ownerOnly ||
      handler.id.startsWith("error_target_") ||
      this.options.configStore?.get().failureTarget !== null ||
      !this.options.taskRegistry?.list().some((task) => task.enabled)
    ) {
      return reply;
    }
    const banner = "⚠️ 故障通知群未绑定，失败通知无法送达。请在目标群运行 /error_target set";
    if (reply.kind === "text") {
      return { ...reply, text: `${reply.text}\n\n${banner}` };
    }
    return {
      ...reply,
      card: {
        ...reply.card,
        elements: [...reply.card.elements, { kind: "markdown", content: banner }]
      }
    };
  }

  private trace(stage: string, input: DispatchInput, detail?: Record<string, unknown>): void {
    this.emitTrace({
      stage,
      source: input.source,
      chatId: input.chatId,
      messageId: input.messageId,
      commandType: input.command.type,
      detail
    });
  }

  private emitTrace(event: FeishuCommandTraceEvent): void {
    if (!this.options.trace) {
      return;
    }
    try {
      this.options.trace(event);
    } catch (error) {
      console.warn("Feishu command trace hook failed", errorMessage(error));
    }
  }

  private async traceAsync<T>(
    stage: string,
    input: DispatchInput,
    action: () => Promise<T>
  ): Promise<T> {
    const startedAt = Date.now();
    this.trace(`${stage}_start`, input);
    try {
      const result = await action();
      this.emitTrace({
        stage: `${stage}_done`,
        source: input.source,
        chatId: input.chatId,
        messageId: input.messageId,
        commandType: input.command.type,
        durationMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      this.trace(`${stage}_failed`, input, {
        durationMs: Date.now() - startedAt,
        error: errorMessage(error)
      });
      throw error;
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
