import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";

export function makeFakeFeishuClient(overrides: Partial<FeishuClientPort> = {}): FeishuClientPort {
  const fallback = async () => undefined;
  return {
    sendText: fallback,
    sendInteractiveCard: fallback,
    sendFile: fallback,
    replyText: fallback,
    replyInteractiveCard: fallback,
    updateInteractiveCard: async () => {},
    updateProgress: async () => {},
    addReaction: fallback,
    removeReaction: async () => {},
    deleteMessage: async () => {},
    fetchBotOpenId: fallback,
    fetchUserName: fallback,
    fetchUserEmail: fallback,
    fetchChatName: fallback,
    fetchChatMembers: async () => [],
    fetchMessage: fallback,
    fetchMergeForwardItems: async () => [],
    sendImage: fallback,
    sendAudio: fallback,
    downloadResource: fallback,
    downloadImage: fallback,
    ...overrides
  };
}
