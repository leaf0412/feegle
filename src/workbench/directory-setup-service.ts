import { stat } from "node:fs/promises";
import type { FeishuChatHandler } from "../feishu/feishu-chat-handler.js";
import type { FeishuCommand } from "../feishu/feishu-gateway.js";
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
  handleDirectorySubmit(input: DirectorySetupSubmitInput): Promise<SlashCommandReply | undefined>;
}

export interface DirectorySetupServiceDeps {
  chatWorkspaces: Pick<ChatWorkspaceStore, "upsert">;
  pendingInteractions: Pick<PendingInteractionStore, "take">;
  chatHandler: Pick<FeishuChatHandler, "handle">;
}

export class DirectorySetupService implements DirectorySetupSubmitHandler {
  constructor(private readonly deps: DirectorySetupServiceDeps) {}

  async handleDirectorySubmit(input: DirectorySetupSubmitInput): Promise<SlashCommandReply | undefined> {
    const workspacePath = selectedWorkspacePath(input.command);
    if (!workspacePath) {
      return { kind: "text", text: "请选择或输入一个工作目录。" };
    }

    if (!(await isReadableDirectory(workspacePath))) {
      return { kind: "text", text: `工作目录不可读取或不是目录：${workspacePath}` };
    }

    this.deps.chatWorkspaces.upsert({
      chatId: input.chatId,
      workspacePath,
      ...(input.command.provider ? { defaultProvider: input.command.provider } : {}),
      ...(input.sender?.userId ? { updatedBy: input.sender.userId } : {})
    });

    const pending = this.deps.pendingInteractions.take(input.command.interactionId);
    if (!pending) {
      return { kind: "text", text: "已保存目录，但原请求已过期。请重新发送需求。" };
    }
    if (pending.kind !== "directory_setup") {
      return { kind: "text", text: `已保存目录，但交互类型不匹配：${pending.kind}` };
    }

    const sessionKey = readPayloadString(pending.payload, "sessionKey");
    const userText = readPayloadString(pending.payload, "userText");
    if (!sessionKey || !userText) {
      return { kind: "text", text: "已保存目录，但原请求上下文不完整。请重新发送需求。" };
    }

    await this.deps.chatHandler.handle({
      chatId: pending.chatId,
      triggerMessageId: pending.messageId,
      sessionKey,
      userText
    });
    return { kind: "text", text: "已保存目录，正在继续处理原请求。" };
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
