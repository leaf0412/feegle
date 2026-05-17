import type { RepositoryRecord } from "../domain/models.js";
import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";
import { buildSlashCommandDetailCard, buildSlashCommandHelpCard } from "../platform/slash-command-help-card.js";

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

interface FeishuCommandResponderOptions {
  repositories?: { list(): RepositoryRecord[] };
  trace?: FeishuCommandTraceSink;
}

export class FeishuCommandResponder implements FeishuCommandHandler {
  constructor(
    private readonly client: FeishuClientPort,
    private readonly options: FeishuCommandResponderOptions = {}
  ) {}

  async handleCommand(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
    shouldRespond?: boolean;
  }): Promise<void> {
    this.trace("received", input);
    if (input.shouldRespond === false) {
      this.trace("skipped_record_only", input);
      return;
    }

    if (input.command.type === "help") {
      const groupKey = input.command.groupKey;
      await this.traceAsync("progress_reply", input, () =>
        this.client.replyInteractiveCard(input.messageId, renderFeishuCard(buildSlashCommandHelpCard(groupKey)))
      );
      this.trace("completed", input);
      return;
    }

    if (input.command.type === "platform_action") {
      const handled = await this.handlePlatformAction(input.messageId, input.command);
      if (handled) {
        return;
      }
    }

    await this.traceAsync("reply_text", input, () =>
      this.client.replyText(input.messageId, buildReplyText(input.command, this.options.repositories))
    );
    this.trace("completed", input);
  }

  private trace(
    stage: string,
    input: {
      source: "message" | "card";
      chatId: string;
      messageId: string;
      command: FeishuCommand;
    },
    detail?: Record<string, unknown>
  ): void {
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
    input: {
      source: "message" | "card";
      chatId: string;
      messageId: string;
      command: FeishuCommand;
    },
    action: () => Promise<T>,
    detail?: Record<string, unknown>
  ): Promise<T> {
    const startedAt = Date.now();
    this.trace(`${stage}_start`, input, detail);
    try {
      const result = await action();
      this.emitTrace({
        stage: `${stage}_done`,
        source: input.source,
        chatId: input.chatId,
        messageId: input.messageId,
        commandType: input.command.type,
        durationMs: Date.now() - startedAt,
        detail
      });
      return result;
    } catch (error) {
      this.trace(`${stage}_failed`, input, {
        ...detail,
        durationMs: Date.now() - startedAt,
        error: errorMessage(error)
      });
      throw error;
    }
  }

  private async handlePlatformAction(
    messageId: string,
    command: Extract<FeishuCommand, { type: "platform_action" }>
  ): Promise<boolean> {
    if (command.action.kind !== "nav") {
      return false;
    }

    if (command.action.command === "/help") {
      await this.client.updateInteractiveCard(messageId, renderFeishuCard(buildSlashCommandHelpCard(command.action.args)));
      return true;
    }

    if (command.action.command === "/command") {
      await this.client.updateInteractiveCard(messageId, renderFeishuCard(buildSlashCommandDetailCard(command.action.args)));
      return true;
    }

    return false;
  }

}

function buildReplyText(command: FeishuCommand, repositories?: { list(): RepositoryRecord[] }): string {
  if (command.type === "repo_select") {
    return `已收到仓库选择：${command.repositoryIds.join("、")}。\n下一步我会基于这些仓库建议需求分支名称。`;
  }

  if (command.type === "push_repository") {
    return `已收到推送请求：需求 ${command.requirementId}，仓库 ${command.repositoryId}。\n当前入口还没有接入 git push 执行器。`;
  }

  if (command.type === "platform_action") {
    return `已收到卡片动作：${command.action.raw}。\n当前入口还没有接入动作路由器。`;
  }

  if (command.type === "help") {
    return "正在打开命令面板。";
  }

  if (command.type === "chat") {
    return "我在，继续说。";
  }

  if (command.type === "slash_command") {
    if (command.definition.id === "repo_list") {
      return renderRepositoryList(repositories?.list() ?? []);
    }
    return `已登记命令：${command.definition.command}\n${command.definition.description}\n当前入口已能识别该命令，具体执行器会在后续切片接入。`;
  }

  return `未知命令：${command.raw}\n当前支持：/repo select <仓库ID1> <仓库ID2>`;
}

function renderRepositoryList(repositories: RepositoryRecord[]): string {
  if (repositories.length === 0) {
    return "暂无已注册仓库。";
  }

  return [
    "已注册仓库：",
    ...repositories.map((repository, index) =>
      `${index + 1}. ${repository.name} (${repository.id}) · ${repository.defaultBaseBranch} · ${repository.remoteUrl}`
    )
  ].join("\n");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
