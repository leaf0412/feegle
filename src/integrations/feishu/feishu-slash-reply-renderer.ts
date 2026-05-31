import type { FeishuClientPort } from "./feishu-client.js";
import type { SlashCommandReply } from "@platform/slash-command-handler.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";

/**
 * Deliver a slash command reply through the Feishu client, choosing the
 * correct API call based on the reply kind.
 */
export async function deliverSlashReply(
  client: FeishuClientPort,
  messageId: string,
  reply: SlashCommandReply
): Promise<void> {
  if (reply.kind === "text") {
    await client.replyText(messageId, reply.text);
    return;
  }
  if (reply.kind === "card") {
    await client.replyInteractiveCard(messageId, renderFeishuCard(reply.card));
    return;
  }
  // card_update
  await client.updateInteractiveCard(messageId, renderFeishuCard(reply.card));
}
