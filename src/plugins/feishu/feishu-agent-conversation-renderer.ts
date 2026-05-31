import type { AgentConversationResult } from "@core/agent-conversation/agent-conversation-models.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { buildRichCards } from "@integrations/feishu/feishu-rich-card.js";

export async function renderFeishuAgentConversationResult(
  client: FeishuClientPort,
  input: {
    chatId: string;
    messageId: string;
    result: AgentConversationResult;
  }
): Promise<void> {
  if (input.result.status === "delivered") {
    await replyRichCards(client, input.messageId, input.result.answer);
    return;
  }

  if (input.result.status === "no_provider") {
    await client.replyText(
      input.messageId,
      "尚未注册任何 agent provider。请运行 /provider register codex cwd=<path> 注册一个。"
    );
    return;
  }

  await client.replyText(input.messageId, `agent 执行失败：${input.result.reason}`);
}

async function replyRichCards(
  client: FeishuClientPort,
  messageId: string,
  markdown: string
): Promise<void> {
  const [firstCard, ...continuationCards] = buildRichCards({
    status: "done",
    steps: [],
    markdown,
    streaming: false
  });
  let parentMessageId = await client.replyInteractiveCard(messageId, JSON.parse(firstCard));
  for (const card of continuationCards) {
    if (!parentMessageId) {
      return;
    }
    parentMessageId = await client.replyInteractiveCard(parentMessageId, JSON.parse(card));
  }
}
