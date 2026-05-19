import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export class StopCommandHandler implements SlashCommandHandler {
  readonly id = "stop";

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    return {
      kind: "text",
      text:
        "feegle 当前每次会话都是一次性 CLI 调用（无长驻 agent 进程），无需 /stop 中止。\n" +
        "如果需要立即停止下一次响应，可以使用 /quiet on 让结果静默不推送。"
    };
  }
}
