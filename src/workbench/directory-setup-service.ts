import { stat } from "node:fs/promises";
import type { FeishuChatHandler } from "../feishu/feishu-chat-handler.js";
import type { FeishuCommand } from "../feishu/feishu-gateway.js";
import { buildDirectorySavedCard } from "../feishu/feishu-workbench-cards.js";
import type { SlashCommandReply } from "../platform/slash-command-handler.js";
import type { ChatWorkspaceStore } from "./chat-workspace-store.js";
import type { PendingInteractionStore } from "./pending-interaction-store.js";

type DirectorySubmitCommand = Extract<FeishuCommand, { type: "workbench_directory_submit" }>;

export interface DirectorySetupSubmitInput {
  chatId: string;
  messageId: string;
  sender?: { platform: "feishu"; userId: string; email?: string };
  command: DirectorySubmitCommand;
}

export interface DirectorySetupSubmitHandler {
  handleDirectorySubmit(input: DirectorySetupSubmitInput): Promise<DirectorySetupSubmitReply | undefined>;
}

export type DirectorySetupSubmitReply =
  | SlashCommandReply
  | { kind: "feishu_card_update"; card: unknown };

export interface DirectorySetupServiceDeps {
  chatWorkspaces: Pick<ChatWorkspaceStore, "upsert">;
  pendingInteractions: Pick<PendingInteractionStore, "take">;
  chatHandler: Pick<FeishuChatHandler, "handle">;
}

export class DirectorySetupService implements DirectorySetupSubmitHandler {
  constructor(private readonly deps: DirectorySetupServiceDeps) {}

  async handleDirectorySubmit(input: DirectorySetupSubmitInput): Promise<DirectorySetupSubmitReply | undefined> {
    const workspacePath = selectedWorkspacePath(input.command);
    if (!workspacePath) {
      return { kind: "text", text: "请选择或输入一个工作目录。" };
    }

    if (!(await isReadableDirectory(workspacePath))) {
      return { kind: "text", text: `工作目录不可读取或不是目录：${workspacePath}` };
    }

    const pending = this.deps.pendingInteractions.take(input.command.interactionId);
    if (!pending) {
      return { kind: "text", text: "目录选择已过期或已处理。请重新发送需求。" };
    }
    if (pending.kind !== "directory_setup") {
      return { kind: "text", text: `目录选择交互类型不匹配：${pending.kind}` };
    }

    const sessionKey = readPayloadString(pending.payload, "sessionKey");
    const userText = readPayloadString(pending.payload, "userText");
    if (!sessionKey || !userText) {
      return { kind: "text", text: "目录选择原请求上下文不完整。请重新发送需求。" };
    }

    this.deps.chatWorkspaces.upsert({
      chatId: input.chatId,
      workspacePath,
      ...(input.command.provider ? { defaultProvider: input.command.provider } : {}),
      ...(input.sender?.userId ? { updatedBy: input.sender.userId } : {})
    });

    await this.deps.chatHandler.handle({
      chatId: pending.chatId,
      triggerMessageId: pending.messageId,
      sessionKey,
      userText
    });
    return {
      kind: "feishu_card_update",
      card: buildDirectorySavedCard({
        workspacePath,
        ...(input.command.provider ? { provider: input.command.provider } : {})
      })
    };
  }
}

function selectedWorkspacePath(command: DirectorySubmitCommand): string | undefined {
  const manualPath = command.manualPath?.trim();
  if (manualPath) return manualPath;
  const workspacePath = command.workspacePath?.trim();
  return workspacePath || undefined;
}

async function isReadableDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}
