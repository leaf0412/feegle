import { access } from "node:fs/promises";
import type { AgentCli } from "../agent/agent-cli.js";
import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";

export class FeishuCommandResponder implements FeishuCommandHandler {
  constructor(
    private readonly client: FeishuClientPort,
    private readonly agent?: AgentCli,
    private readonly options: { agentDisplayName?: string } = {}
  ) {}

  async handleCommand(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
  }): Promise<void> {
    if (input.command.type === "unknown" && this.agent) {
      const agentDisplayName = this.options.agentDisplayName ?? "Codex";
      await this.client.sendText(input.chatId, `收到需求，正在交给 ${agentDisplayName} 分析...`);
      try {
        const plan = await this.agent.generatePlan({
          requirementId: input.messageId,
          title: input.command.raw.split("\n")[0] ?? input.messageId,
          requirementText: input.command.raw
        });
        const reply = await buildAgentReply(plan);
        if (reply.text) {
          await this.client.sendText(input.chatId, reply.text);
        }
        for (const filePath of reply.filePaths) {
          await this.client.sendFile(input.chatId, filePath);
        }
        for (const filePath of reply.missingFilePaths) {
          await this.client.sendText(input.chatId, `文件发送失败：${filePath} 不存在或不可读取。`);
        }
      } catch (error) {
        await this.client.sendText(input.chatId, `${agentDisplayName} 分析失败：${errorMessage(error)}`);
      }
      return;
    }

    await this.client.sendText(input.chatId, buildReplyText(input.command));
  }
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
