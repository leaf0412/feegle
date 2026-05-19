import type { SessionStore } from "../../../agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface QuietCommandDeps {
  sessionStore: SessionStore;
}

export class QuietCommandHandler implements SlashCommandHandler {
  readonly id = "quiet";

  constructor(private readonly deps: QuietCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    if (!context.sessionKey) {
      return textReply("无法识别当前会话上下文，/quiet 不可用。");
    }
    const arg = context.args.trim().toLowerCase();
    const session = await this.deps.sessionStore.getOrCreate(context.sessionKey);
    const currentQuiet = session.quiet ?? false;
    const nextQuiet = parseArg(arg, currentQuiet);
    if (nextQuiet === undefined) {
      return textReply(`用法：/quiet [on|off|toggle]\n当前: ${currentQuiet ? "已静默" : "正常"}`);
    }
    if (nextQuiet === currentQuiet) {
      return textReply(`已是 ${nextQuiet ? "静默" : "正常"} 模式，无变化。`);
    }
    await this.deps.sessionStore.setQuiet(context.sessionKey, nextQuiet);
    return textReply(nextQuiet ? "🔇 已切换为静默模式（仅最终结果，不推送中间进度卡片）。" : "🔊 已切换为正常模式。");
  }
}

function parseArg(arg: string, current: boolean): boolean | undefined {
  if (arg === "" || arg === "toggle") return !current;
  if (arg === "on" || arg === "true" || arg === "1") return true;
  if (arg === "off" || arg === "false" || arg === "0") return false;
  return undefined;
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
