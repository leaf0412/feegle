import type { AgentChatMessage } from "./agent-cli.js";

export interface ChatHistoryStoreOptions {
  /** Cap the per-session turn count so prompts don't grow unbounded. Default 20 messages (~10 turns). */
  maxMessages?: number;
}

const DEFAULT_MAX_MESSAGES = 20;

export class ChatHistoryStore {
  private readonly histories = new Map<string, AgentChatMessage[]>();
  private readonly maxMessages: number;

  constructor(options: ChatHistoryStoreOptions = {}) {
    const limit = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
    if (limit <= 0) {
      throw new Error("maxMessages must be a positive integer");
    }
    this.maxMessages = limit;
  }

  get(sessionKey: string): AgentChatMessage[] {
    const history = this.histories.get(sessionKey);
    return history ? history.map((message) => ({ ...message })) : [];
  }

  append(sessionKey: string, message: AgentChatMessage): AgentChatMessage[] {
    const history = this.histories.get(sessionKey) ?? [];
    history.push({ ...message });
    if (history.length > this.maxMessages) {
      history.splice(0, history.length - this.maxMessages);
    }
    this.histories.set(sessionKey, history);
    return history.map((entry) => ({ ...entry }));
  }

  clear(sessionKey: string): void {
    this.histories.delete(sessionKey);
  }

  sessions(): string[] {
    return Array.from(this.histories.keys());
  }
}
