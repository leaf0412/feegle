import type { SessionStore, SessionRecord } from "../../../agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface SwitchCommandDeps {
  sessionStore: SessionStore;
}

export class SwitchCommandHandler implements SlashCommandHandler {
  readonly id = "switch";

  constructor(private readonly deps: SwitchCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const query = context.args.trim();
    if (!query) {
      return textReply("用法：/switch <名称|序号|session_key 后缀>");
    }
    const all = this.deps.sessionStore.list();
    const match = findMatch(all, query);
    if (!match) {
      return textReply(`未找到匹配 “${query}” 的会话。运行 /list 查看可用会话。`);
    }
    if (match.sessionKey === context.sessionKey) {
      return textReply(`已经在 “${match.name ?? match.sessionKey}” 中。`);
    }
    const lines: string[] = [
      `找到会话 “${match.name ?? "(unnamed)"}”，但 feegle 不支持跨 chat 切换运行上下文。`,
      `请直接前往会话所在群继续对话：`,
      `  session_key: ${match.sessionKey}`,
      `  状态: ${match.status}`,
      `  最近活跃: ${match.lastActiveAt}`
    ];
    return textReply(lines.join("\n"));
  }
}

function findMatch(sessions: SessionRecord[], query: string): SessionRecord | undefined {
  const indexMatch = /^(\d+)$/.exec(query);
  if (indexMatch) {
    const i = Number(indexMatch[1]) - 1;
    if (i >= 0 && i < sessions.length) {
      return sessions[i];
    }
  }
  const exact = sessions.find((s) => s.name === query);
  if (exact) return exact;
  const suffix = sessions.find((s) => s.sessionKey.endsWith(query));
  if (suffix) return suffix;
  return sessions.find((s) => s.name?.toLowerCase().includes(query.toLowerCase()));
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
