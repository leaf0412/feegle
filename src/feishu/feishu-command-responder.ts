import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";
import {
  extractSlashCommandArgs,
  type SlashCommandHandler,
  type SlashCommandReply,
  type SlashCommandRegistry
} from "../platform/slash-command-handler.js";
import type { FeishuChatHandler } from "./feishu-chat-handler.js";
import { dispatchPlatformCommandAction } from "../platform/platform-action-dispatcher.js";
import type { FeishuUserDirectory } from "./feishu-user-directory.js";

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
  chatHandler?: FeishuChatHandler;
  trace?: FeishuCommandTraceSink;
  configStore?: { get(): { failureTarget: unknown } };
  taskRegistry?: { list(): ReadonlyArray<{ enabled: boolean }> };
  userDirectory?: FeishuUserDirectory;
  workbench?: FeishuWorkbenchHandler;
}

export type FeishuWorkbenchReply =
  | SlashCommandReply
  | { kind: "feishu_card"; card: unknown }
  | { kind: "feishu_card_update"; card: unknown };

export interface FeishuWorkbenchHandler {
  handlePlanRevise?(input: PlanReviseInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanRevisionSubmit?(input: PlanRevisionSubmitInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanApprove?(input: PlanActionInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanCancel?(input: PlanActionInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanReject?(input: PlanActionInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanPush?(input: PlanActionInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanCleanup?(input: PlanActionInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanBaseBranchSubmit?(input: PlanBaseBranchSubmitInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanReviseExecution?(input: PlanActionInput): Promise<FeishuWorkbenchReply | undefined>;
  handlePlanReviseExecutionSubmit?(input: PlanReviseExecutionSubmitInput): Promise<FeishuWorkbenchReply | undefined>;
}

export interface PlanReviseInput {
  chatId: string;
  messageId: string;
  command: Extract<FeishuCommand, { type: "workbench_plan_revise" }>;
}

export interface PlanRevisionSubmitInput {
  chatId: string;
  messageId: string;
  sender?: FeishuCommandSender;
  command: Extract<FeishuCommand, { type: "workbench_plan_revision_submit" }>;
}

export interface PlanActionInput {
  chatId: string;
  messageId: string;
  command: Extract<
    FeishuCommand,
    {
      type:
        | "workbench_plan_approve"
        | "workbench_plan_cancel"
        | "workbench_plan_reject"
        | "workbench_plan_push"
        | "workbench_plan_cleanup"
        | "workbench_plan_revise_execution";
    }
  >;
}

export interface PlanBaseBranchSubmitInput {
  chatId: string;
  messageId: string;
  command: Extract<FeishuCommand, { type: "workbench_plan_base_branch_submit" }>;
}

export interface PlanReviseExecutionSubmitInput {
  chatId: string;
  messageId: string;
  command: Extract<FeishuCommand, { type: "workbench_plan_revise_execution_submit" }>;
}

interface DispatchInput {
  source: "message" | "card";
  chatId: string;
  messageId: string;
  sender?: { platform: "feishu"; userId: string; email?: string };
  sessionKey?: string;
  command: FeishuCommand;
}

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

    if (input.command.type === "chat") {
      await this.dispatchChat(input, input.command.raw);
      this.trace("completed", input);
      return;
    }

    const reply = await this.computeReply(input);
    if (!reply) {
      this.trace("ignored", input);
      return;
    }

    await this.deliver(input, reply);
    this.trace("completed", input);
  }

  private async dispatchChat(input: DispatchInput, userText: string): Promise<void> {
    if (!this.options.chatHandler) {
      await this.traceAsync("reply_text", input, () =>
        this.client.replyText(input.messageId, "尚未配置 agent。请运行 /provider register <kind> cwd=<path> 注册并 /provider use 激活。")
      );
      return;
    }
    const sessionKey = input.sessionKey ?? `feishu:${input.chatId}:${input.chatId}`;
    await this.traceAsync("chat", input, () =>
      this.options.chatHandler!.handle({
        chatId: input.chatId,
        triggerMessageId: input.messageId,
        sessionKey,
        userText
      })
    );
  }

  private async computeReply(input: DispatchInput): Promise<FeishuWorkbenchReply | undefined> {
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
      case "workbench_directory_submit":
        return { kind: "text", text: "目录设置已下线：通用聊天现在固定运行在全局工作目录。" };
      case "workbench_plan_revision_submit":
        return this.dispatchWorkbenchPlanRevisionSubmit(input, command);
      case "workbench_plan_revise":
        return this.dispatchWorkbenchPlanRevise(input, command);
      case "workbench_plan_approve":
      case "workbench_plan_cancel":
      case "workbench_plan_reject":
      case "workbench_plan_push":
      case "workbench_plan_cleanup":
      case "workbench_plan_revise_execution":
        return this.dispatchPlanAction(input, command);
      case "workbench_plan_base_branch_submit":
        return this.dispatchPlanBaseBranchSubmit(input, command);
      case "workbench_plan_revise_execution_submit":
        return this.dispatchPlanReviseExecutionSubmit(input, command);
      case "chat":
        return undefined;
      case "repo_select":
        return {
          kind: "text",
          text: `已收到仓库选择：${command.repositoryIds.join("、")}。\n下一步我会基于这些仓库建议需求分支名称。`
        };
      case "push_repository":
        return {
          kind: "text",
          text: `已收到推送请求：需求 ${command.requirementId}，仓库 ${command.repositoryId}。\n当前入口还没有接入 git push 执行器。`
        };
      case "unknown":
        return { kind: "text", text: `未知命令：${command.raw}` };
      default: {
        const _exhaustive: never = command;
        return _exhaustive;
      }
    }
  }

  private async dispatchWorkbenchPlanRevise(
    input: DispatchInput,
    command: Extract<FeishuCommand, { type: "workbench_plan_revise" }>
  ): Promise<FeishuWorkbenchReply | undefined> {
    if (!this.options.workbench?.handlePlanRevise) {
      return { kind: "text", text: "已收到计划修改请求，当前入口还没有接入修改表单。" };
    }
    return this.options.workbench.handlePlanRevise({
      chatId: input.chatId,
      messageId: input.messageId,
      command
    });
  }

  private async dispatchWorkbenchPlanRevisionSubmit(
    input: DispatchInput,
    command: Extract<FeishuCommand, { type: "workbench_plan_revision_submit" }>
  ): Promise<FeishuWorkbenchReply | undefined> {
    if (!this.options.workbench?.handlePlanRevisionSubmit) {
      return { kind: "text", text: "已收到计划修改意见，当前入口还没有接入计划修订执行器。" };
    }
    return this.options.workbench.handlePlanRevisionSubmit({
      chatId: input.chatId,
      messageId: input.messageId,
      ...(input.sender ? { sender: input.sender } : {}),
      command
    });
  }

  private async dispatchPlanAction(
    input: DispatchInput,
    command: PlanActionInput["command"]
  ): Promise<FeishuWorkbenchReply | undefined> {
    const handlerMap: Record<PlanActionInput["command"]["type"], keyof FeishuWorkbenchHandler> = {
      workbench_plan_approve: "handlePlanApprove",
      workbench_plan_cancel: "handlePlanCancel",
      workbench_plan_reject: "handlePlanReject",
      workbench_plan_push: "handlePlanPush",
      workbench_plan_cleanup: "handlePlanCleanup",
      workbench_plan_revise_execution: "handlePlanReviseExecution"
    };
    const key = handlerMap[command.type];
    const handler = this.options.workbench?.[key] as
      | ((input: PlanActionInput) => Promise<FeishuWorkbenchReply | undefined>)
      | undefined;
    if (!handler) {
      return { kind: "text", text: `计划 ${command.type} 处理器尚未接入` };
    }
    return handler.call(this.options.workbench, {
      chatId: input.chatId,
      messageId: input.messageId,
      command
    });
  }

  private async dispatchPlanBaseBranchSubmit(
    input: DispatchInput,
    command: PlanBaseBranchSubmitInput["command"]
  ): Promise<FeishuWorkbenchReply | undefined> {
    if (!this.options.workbench?.handlePlanBaseBranchSubmit) {
      return { kind: "text", text: "BaseBranch 处理器尚未接入" };
    }
    return this.options.workbench.handlePlanBaseBranchSubmit({
      chatId: input.chatId,
      messageId: input.messageId,
      command
    });
  }

  private async dispatchPlanReviseExecutionSubmit(
    input: DispatchInput,
    command: PlanReviseExecutionSubmitInput["command"]
  ): Promise<FeishuWorkbenchReply | undefined> {
    if (!this.options.workbench?.handlePlanReviseExecutionSubmit) {
      return { kind: "text", text: "继续调整处理器尚未接入" };
    }
    return this.options.workbench.handlePlanReviseExecutionSubmit({
      chatId: input.chatId,
      messageId: input.messageId,
      command
    });
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

  private async deliver(input: DispatchInput, reply: FeishuWorkbenchReply): Promise<void> {
    if (reply.kind === "text") {
      await this.traceAsync("reply_text", input, () => this.client.replyText(input.messageId, reply.text));
      return;
    }
    if (reply.kind === "card") {
      await this.traceAsync("reply_card", input, () =>
        this.client.replyInteractiveCard(input.messageId, renderFeishuCard(reply.card))
      );
      return;
    }
    if (reply.kind === "feishu_card") {
      await this.traceAsync("reply_card", input, () => this.client.replyInteractiveCard(input.messageId, reply.card));
      return;
    }
    if (reply.kind === "feishu_card_update") {
      await this.traceAsync("update_card", input, () => this.client.updateInteractiveCard(input.messageId, reply.card));
      return;
    }
    await this.traceAsync("update_card", input, () =>
      this.client.updateInteractiveCard(input.messageId, renderFeishuCard(reply.card))
    );
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
