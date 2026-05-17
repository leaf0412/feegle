import { access } from "node:fs/promises";
import type { AgentCli } from "../agent/agent-cli.js";
import type { RepositoryRecord } from "../domain/models.js";
import type { PlatformProgressEntry, PlatformProgressSnapshot } from "../platform/progress.js";
import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";
import { renderFeishuProgressCard } from "./feishu-progress-card.js";
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
  agentDisplayName?: string;
  reactionEmoji?: string;
  doneEmoji?: string;
  reactionTimeoutMs?: number;
  repositories?: { list(): RepositoryRecord[] };
  trace?: FeishuCommandTraceSink;
}

export class FeishuCommandResponder implements FeishuCommandHandler {
  constructor(
    private readonly client: FeishuClientPort,
    private readonly agent?: AgentCli,
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

    if (input.command.type === "unknown" && this.agent) {
      const agentDisplayName = this.options.agentDisplayName ?? "Codex";
      const rawText = input.command.raw;
      const reactionIdPromise = this.addProcessingReaction(input);
      const progressMessageId = await this.traceAsync("progress_reply", input, () =>
        this.client.replyInteractiveCard(
          input.messageId,
          renderFeishuProgressCard(
            createProgressSnapshot(agentDisplayName, "running", [
              { kind: "thinking", text: "收到需求，正在准备分析。" }
            ])
          )
        )
      );
      const reactionId = await this.resolveProcessingReaction(input, reactionIdPromise);
      try {
        const progressEntries: PlatformProgressEntry[] = [
          { kind: "thinking", text: "正在调用 Agent 分析需求。" }
        ];
        await this.updateProgress(progressMessageId, agentDisplayName, "running", progressEntries, input);
        const plan = await this.traceAsync("agent", input, () =>
          this.agent!.generatePlan({
            requirementId: input.messageId,
            title: rawText.split("\n")[0] ?? input.messageId,
            requirementText: rawText
          }, {
            onProgress: async (update) => {
              progressEntries.push(toProgressEntry(update));
              await this.updateProgress(progressMessageId, agentDisplayName, "running", progressEntries, input);
            }
          })
        );
        progressEntries.push({ kind: "thinking", text: "Agent 已返回结果，正在整理并发送回复。" });
        await this.updateProgress(progressMessageId, agentDisplayName, "running", progressEntries, input);
        const reply = await buildAgentReply(plan);
        if (reply.text) {
          await this.traceAsync("reply_text", input, () => this.client.replyText(input.messageId, reply.text));
        }
        for (const filePath of reply.filePaths) {
          await this.traceAsync("send_file", input, () => this.client.sendFile(input.chatId, filePath), { filePath });
        }
        for (const filePath of reply.missingFilePaths) {
          await this.traceAsync("reply_text", input, () =>
            this.client.replyText(input.messageId, `文件发送失败：${filePath} 不存在或不可读取。`),
            { filePath }
          );
        }
        await this.updateProgress(progressMessageId, agentDisplayName, "completed", [
          { kind: "info", text: "分析完成，结果已回复。" }
        ], input);
        await this.finishReactions(input, reactionId);
        this.trace("completed", input);
      } catch (error) {
        this.trace("failed", input, { error: errorMessage(error) });
        await this.updateProgress(progressMessageId, agentDisplayName, "failed", [
          { kind: "error", text: errorMessage(error) }
        ], input);
        await this.traceAsync("reply_text", input, () =>
          this.client.replyText(input.messageId, `${agentDisplayName} 分析失败：${errorMessage(error)}`)
        );
        await this.finishReactions(input, reactionId);
      }
      return;
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

  private async addProcessingReaction(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
  }): Promise<string | undefined> {
    if (!this.options.reactionEmoji) {
      return undefined;
    }
    const startedAt = Date.now();
    this.trace("reaction_start", input, { emojiType: this.options.reactionEmoji });
    try {
      const reactionId = await this.client.addReaction(input.messageId, this.options.reactionEmoji);
      this.trace("reaction_done", input, {
        durationMs: Date.now() - startedAt,
        emojiType: this.options.reactionEmoji,
        reactionId
      });
      return reactionId;
    } catch (error) {
      this.trace("reaction_failed", input, {
        durationMs: Date.now() - startedAt,
        emojiType: this.options.reactionEmoji,
        error: errorMessage(error)
      });
      console.warn("Feishu reaction add failed", errorMessage(error));
      return undefined;
    }
  }

  private async resolveProcessingReaction(
    input: {
      source: "message" | "card";
      chatId: string;
      messageId: string;
      command: FeishuCommand;
    },
    reactionIdPromise: Promise<string | undefined>
  ): Promise<string | undefined> {
    const timeoutMs = this.options.reactionTimeoutMs ?? 1500;
    return Promise.race([
      reactionIdPromise,
      new Promise<undefined>((resolve) => {
        setTimeout(() => {
          this.trace("reaction_timeout", input, { timeoutMs });
          console.warn("Feishu reaction add timed out", { messageId: input.messageId, timeoutMs });
          resolve(undefined);
        }, timeoutMs);
      })
    ]);
  }

  private async finishReactions(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
  }, reactionId: string | undefined): Promise<void> {
    if (reactionId) {
      try {
        await this.traceAsync("reaction_remove", input, () => this.client.removeReaction(input.messageId, reactionId));
      } catch (error) {
        console.warn("Feishu reaction remove failed", errorMessage(error));
      }
    }
    if (this.options.doneEmoji) {
      const doneEmoji = this.options.doneEmoji;
      try {
        await this.traceAsync("done_reaction", input, () => this.client.addReaction(input.messageId, doneEmoji));
      } catch (error) {
        console.warn("Feishu reaction done add failed", errorMessage(error));
      }
    }
  }

  private async updateProgress(
    progressMessageId: string | undefined,
    title: string,
    state: PlatformProgressSnapshot["state"],
    entries: PlatformProgressEntry[],
    input?: {
      source: "message" | "card";
      chatId: string;
      messageId: string;
      command: FeishuCommand;
    }
  ): Promise<void> {
    if (!progressMessageId) {
      return;
    }
    if (input) {
      await this.traceAsync("progress_update", input, () =>
        this.client.updateProgress(progressMessageId, createProgressSnapshot(title, state, entries)),
        { progressMessageId, state }
      );
      return;
    }
    await this.client.updateProgress(progressMessageId, createProgressSnapshot(title, state, entries));
  }
}

function createProgressSnapshot(
  title: string,
  state: PlatformProgressSnapshot["state"],
  entries: PlatformProgressEntry[]
): PlatformProgressSnapshot {
  return {
    title,
    state,
    truncated: false,
    entries
  };
}

function toProgressEntry(update: {
  kind: "thinking" | "tool_use" | "tool_result" | "error" | "info";
  text: string;
  tool?: string;
}): PlatformProgressEntry {
  return update;
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

  if (command.type === "slash_command") {
    if (command.definition.id === "repo_list") {
      return renderRepositoryList(repositories?.list() ?? []);
    }
    return `已登记命令：${command.definition.command}\n${command.definition.description}\n当前入口已能识别该命令，具体执行器会在后续切片接入。`;
  }

  return `我收到了消息，但还不认识这个指令：${command.raw}\n当前支持：/repo select <仓库ID1> <仓库ID2>`;
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

interface AgentReply {
  text: string;
  filePaths: string[];
  missingFilePaths: string[];
}

async function buildAgentReply(output: string): Promise<AgentReply> {
  const textLines: string[] = [];
  const filePaths: string[] = [];
  const missingFilePaths: string[] = [];

  for (const line of output.split("\n")) {
    const filePath = parseFileMarker(line);
    if (filePath === null) {
      textLines.push(line);
      continue;
    }

    if (await isReadable(filePath)) {
      filePaths.push(filePath);
    } else {
      missingFilePaths.push(filePath);
    }
  }

  return {
    text: textLines.join("\n").trim(),
    filePaths,
    missingFilePaths
  };
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseFileMarker(line: string): string | null {
  const trimmed = line.trim();
  const prefix = "feegle:file:";
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const filePath = trimmed.slice(prefix.length).trim();
  return filePath.startsWith("/") ? filePath : null;
}
