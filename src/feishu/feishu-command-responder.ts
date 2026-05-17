import type { FeishuClientPort } from "./feishu-client.js";
import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuCommandHandler } from "./feishu-long-connection-runtime.js";

export class FeishuCommandResponder implements FeishuCommandHandler {
  constructor(private readonly client: FeishuClientPort) {}

  async handleCommand(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
  }): Promise<void> {
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

  return `我收到了消息，但还不认识这个指令：${command.raw}\n当前支持：/repo select <仓库ID1> <仓库ID2>`;
}
