import type { FeishuClientPort } from "./feishu-client.js";

export interface StartTypingOptions {
  emojiType?: string;
}

const DEFAULT_TYPING_EMOJI = "OnIt";

export async function startTyping(
  client: FeishuClientPort,
  messageId: string,
  options: StartTypingOptions = {}
): Promise<() => Promise<void>> {
  const emoji = options.emojiType ?? DEFAULT_TYPING_EMOJI;
  if (emoji === "" || messageId === "") {
    return async () => {};
  }
  const reactionId = await client.addReaction(messageId, emoji);
  if (!reactionId) {
    return async () => {};
  }
  return async () => {
    await client.removeReaction(messageId, reactionId);
  };
}

export async function addDoneReaction(
  client: FeishuClientPort,
  messageId: string,
  emojiType: string | undefined
): Promise<void> {
  if (!emojiType || messageId === "") {
    return;
  }
  await client.addReaction(messageId, emojiType);
}
