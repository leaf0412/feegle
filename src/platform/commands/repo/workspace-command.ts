import { isAbsolute } from "node:path";
import type { WorkspaceStore } from "../../../repositories/workspace-store.js";
import { isOwner } from "../../owner-access.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface WorkspaceCommandDeps {
  workspaceStore: WorkspaceStore;
  ownerEmails?: ReadonlySet<string>;
}

export class WorkspaceCommandHandler implements SlashCommandHandler {
  readonly id = "workspace";
  readonly ownerOnly = true;

  constructor(private readonly deps: WorkspaceCommandDeps) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails ?? new Set());
  }

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const args = context.args.trim();
    if (args === "" || args === "list") {
      return renderList(this.deps.workspaceStore);
    }

    const removeMatch = /^remove\s+(\S+)$/.exec(args);
    if (removeMatch) {
      const ws = this.deps.workspaceStore.findByQuery(removeMatch[1]!);
      if (!ws) {
        return textReply(`未找到匹配 “${removeMatch[1]}” 的 workspace。`);
      }
      await this.deps.workspaceStore.remove(ws.id);
      return textReply(`✅ 已移除 workspace ${ws.id} (${ws.path})`);
    }

    const addMatch = /^add\s+(.+)$/.exec(args);
    if (addMatch) {
      const tokens = addMatch[1]!.trim().split(/\s+/);
      const path = tokens[0]!;
      const name = tokens.slice(1).join(" ").trim();
      if (!isAbsolute(path)) {
        return textReply("workspace 路径必须是绝对路径。");
      }
      const ws = await this.deps.workspaceStore.add({
        path,
        ...(name ? { name } : {})
      });
      return textReply(`✅ 已注册 workspace ${ws.id}\n  path: ${ws.path}${ws.name ? `\n  name: ${ws.name}` : ""}`);
    }

    return textReply("用法：/workspace list | /workspace add <abs-path> [name] | /workspace remove <#|id|name|path>");
  }
}

function renderList(store: WorkspaceStore): SlashCommandReply {
  const list = store.list();
  if (list.length === 0) {
    return textReply("还没有 workspace。运行 /workspace add <绝对路径> [name]。");
  }
  const lines: string[] = [`🗂 workspace（${list.length}）`];
  list.forEach((ws, index) => {
    const label = ws.name ? ` ${ws.name}` : "";
    lines.push(`  #${index + 1} ${ws.id}${label} · ${ws.path}`);
  });
  return textReply(lines.join("\n"));
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
