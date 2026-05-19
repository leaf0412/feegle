import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type { WorkspaceStore } from "../../../repositories/workspace-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface DirCommandDeps {
  workspaceStore: WorkspaceStore;
  chatBindingStore: ChatBindingStore;
}

export class DirCommandHandler implements SlashCommandHandler {
  readonly id = "dir";

  constructor(private readonly deps: DirCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const args = context.args.trim();
    const binding = this.deps.chatBindingStore.get(context.chatId);
    const current = binding?.workspaceId ? this.deps.workspaceStore.get(binding.workspaceId) : undefined;

    if (args === "" || args === "list") {
      const workspaces = this.deps.workspaceStore.list();
      if (workspaces.length === 0) {
        return textReply("还没有 workspace。运行 /workspace add <绝对路径> 注册。");
      }
      const lines: string[] = ["📂 当前 chat 可用 workspace"];
      workspaces.forEach((ws, index) => {
        const marker = current?.id === ws.id ? "▶" : "◻";
        const label = ws.name ? ` ${ws.name}` : "";
        lines.push(`${marker} #${index + 1} ${ws.id}${label} · ${ws.path}`);
      });
      lines.push("");
      lines.push("用 /dir use <id|#index|name> 切换当前 chat 的工作目录。");
      return textReply(lines.join("\n"));
    }

    const useMatch = /^use\s+(\S+)$/.exec(args);
    if (useMatch) {
      const ws = this.deps.workspaceStore.findByQuery(useMatch[1]!);
      if (!ws) {
        return textReply(`未找到匹配 “${useMatch[1]}” 的 workspace。运行 /dir list 查看。`);
      }
      await this.deps.chatBindingStore.upsert({ chatId: context.chatId, workspaceId: ws.id });
      return textReply(`✅ 已切换当前 chat 的 workspace 到 ${ws.id} (${ws.path})`);
    }

    return textReply("用法：/dir | /dir list | /dir use <id|#index|name>");
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
