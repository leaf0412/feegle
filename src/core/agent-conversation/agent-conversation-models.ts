import type { AgentChatMessage, AgentProgressUpdate } from "@integrations/agent/agent-cli.js";

export interface AgentConversationInput {
  workspaceId: string;
  projectId: string | null;
  conversationKey: string;
  sessionKey: string;
  userId: string;
  userText: string;
  source: {
    pluginId: string;
    chatId?: string;
    messageId?: string;
  };
}

export type AgentConversationProgress =
  | {
      type: "started";
      provider: string;
      message?: string;
      at: string;
    }
  | ({
      type: "progress";
      provider: string;
      at: string;
    } & AgentProgressUpdate);

export type AgentConversationResult =
  | {
      status: "delivered";
      provider: string;
      answer: string;
      messages: AgentChatMessage[];
      progress: AgentConversationProgress[];
      switchNotice?: string;
    }
  | {
      status: "no_provider";
      reason: string;
      progress: AgentConversationProgress[];
    }
  | {
      status: "failed";
      reason: string;
      provider?: string;
      progress: AgentConversationProgress[];
    };
