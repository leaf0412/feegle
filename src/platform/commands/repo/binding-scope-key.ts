import type { SlashCommandContext } from "../../slash-command-handler.js";

/**
 * The key a repo binding is stored under. Group chats share one binding keyed
 * by the chat id; a single (p2p) chat is keyed by the user so the binding is
 * personal, not tied to that one conversation. A single chat with no user id
 * is an error rather than a silent fall back to the chat id (which would
 * re-introduce the per-conversation bug).
 */
export function resolveBindingScopeKey(context: SlashCommandContext): string {
  if (context.chatType === "group") {
    return context.chatId;
  }
  const userId = context.sender.userId;
  if (userId === "") {
    throw new Error("cannot scope a single-chat repo binding: missing user id");
  }
  return `user:${userId}`;
}

/**
 * Human-facing noun for the binding scope, paired with resolveBindingScopeKey
 * so the stored key and the wording a user sees never drift apart.
 */
export function resolveBindingScopeNoun(context: SlashCommandContext): string {
  return context.chatType === "group" ? "本群" : "你（单聊）";
}
