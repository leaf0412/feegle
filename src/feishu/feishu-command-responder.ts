import { access } from "node:fs/promises";
import type { AgentCli } from "../agent/agent-cli.js";
import type { PlatformProgressEntry, PlatformProgressSnapshot } from "../platform/progress.js";
import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";
import { renderFeishuProgressCard } from "./feishu-progress-card.js";
import { buildSlashCommandDetailCard, buildSlashCommandHelpCard } from "../platform/slash-command-help-card.js";

export class FeishuCommandResponder implements FeishuCommandHandler {
  constructor(
    private readonly client: FeishuClientPort,
    private readonly agent?: AgentCli,
    private readonly options: { agentDisplayName?: string; reactionEmoji?: string; doneEmoji?: string } = {}
  ) {}

  async handleCommand(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
    shouldRespond?: boolean;
  }): Promise<void> {
    if (input.shouldRespond === false) {
      return;
    }

    if (input.command.type === "help") {
      await this.client.replyInteractiveCard(input.messageId, renderFeishuCard(buildSlashCommandHelpCard(input.command.groupKey)));
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
      const reactionId = await this.addProcessingReaction(input.messageId);
      const progressMessageId = await this.client.replyInteractiveCard(
        input.messageId,
        renderFeishuProgressCard(
          createProgressSnapshot(agentDisplayName, "running", [
            { kind: "thinking", text: "收到需求，正在准备分析。" }
          ])
        )
      );
      try {
        const progressEntries: PlatformProgressEntry[] = [
          { kind: "thinking", text: "正在调用 Agent 分析需求。" }
        ];
        await this.updateProgress(progressMessageId, agentDisplayName, "running", progressEntries);
        const plan = await this.agent.generatePlan({
          requirementId: input.messageId,
          title: input.command.raw.split("\n")[0] ?? input.messageId,
          requirementText: input.command.raw
        }, {
          onProgress: async (update) => {
            progressEntries.push(toProgressEntry(update));
            await this.updateProgress(progressMessageId, agentDisplayName, "running", progressEntries);
          }
        });
        progressEntries.push({ kind: "thinking", text: "Agent 已返回结果，正在整理并发送回复。" });
        await this.updateProgress(progressMessageId, agentDisplayName, "running", progressEntries);
        const reply = await buildAgentReply(plan);
        if (reply.text) {
          await this.client.replyText(input.messageId, reply.text);
        }
        for (const filePath of reply.filePaths) {
          await this.client.sendFile(input.chatId, filePath);
        }
        for (const filePath of reply.missingFilePaths) {
          await this.client.replyText(input.messageId, `文件发送失败：${filePath} 不存在或不可读取。`);
        }
        await this.updateProgress(progressMessageId, agentDisplayName, "completed", [
          { kind: "info", text: "分析完成，结果已回复。" }
        ]);
        await this.finishReactions(input.messageId, reactionId);
      } catch (error) {
        await this.updateProgress(progressMessageId, agentDisplayName, "failed", [
          { kind: "error", text: errorMessage(error) }
        ]);
        await this.client.replyText(input.messageId, `${agentDisplayName} 分析失败：${errorMessage(error)}`);
        await this.finishReactions(input.messageId, reactionId);
      }
      return;
    }

    await this.client.replyText(input.messageId, buildReplyText(input.command));
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

  private async addProcessingReaction(messageId: string): Promise<string | undefined> {
    if (!this.options.reactionEmoji) {
      return undefined;
    }
    try {
      return await this.client.addReaction(messageId, this.options.reactionEmoji);
    } catch (error) {
      console.warn("Feishu reaction add failed", errorMessage(error));
      return undefined;
    }
  }

  private async finishReactions(messageId: string, reactionId: string | undefined): Promise<void> {
    if (reactionId) {
      try {
        await this.client.removeReaction(messageId, reactionId);
      } catch (error) {
        console.warn("Feishu reaction remove failed", errorMessage(error));
      }
    }
    if (this.options.doneEmoji) {
      try {
        await this.client.addReaction(messageId, this.options.doneEmoji);
      } catch (error) {
        console.warn("Feishu reaction done add failed", errorMessage(error));
      }
    }
  }

  private async updateProgress(
    progressMessageId: string | undefined,
    title: string,
    state: PlatformProgressSnapshot["state"],
    entries: PlatformProgressEntry[]
  ): Promise<void> {
    if (!progressMessageId) {
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

function buildReplyText(command: FeishuCommand): string {
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
    return `已登记命令：${command.definition.command}\n${command.definition.description}\n当前入口已能识别该命令，具体执行器会在后续切片接入。`;
  }

  return `我收到了消息，但还不认识这个指令：${command.raw}\n当前支持：/repo select <仓库ID1> <仓库ID2>`;
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
