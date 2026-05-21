import type { AgentProgressUpdate, AgentRunOptions } from "./agent-cli.js";
import { emitAgentProgress } from "./agent-progress.js";

export class AgentStreamParser {
  private readonly messages: string[] = [];
  private pendingAssistantMessage: string | undefined;

  constructor(private readonly options?: AgentRunOptions) {}

  async assistantMessage(text: string): Promise<void> {
    await this.flushPendingAssistantMessageAsProgress();
    const trimmed = text.trim();
    if (trimmed) {
      this.pendingAssistantMessage = trimmed;
    }
  }

  async reasoning(text: string): Promise<void> {
    await this.flushPendingAssistantMessageAsProgress();
    await this.emit({ kind: "thinking", text });
  }

  async toolUse(tool: string | undefined, text: string): Promise<void> {
    await this.flushPendingAssistantMessageAsProgress();
    await this.emit({ kind: "tool_use", tool, text });
  }

  async toolResult(tool: string | undefined, text: string): Promise<void> {
    await this.flushPendingAssistantMessageAsProgress();
    await this.emit({ kind: "tool_result", tool, text });
  }

  async error(text: string): Promise<void> {
    await this.emit({ kind: "error", text });
  }

  async finalResult(text: string): Promise<void> {
    await this.flushPendingAssistantMessageAsProgress();
    const trimmed = text.trim();
    if (trimmed) {
      this.messages.push(trimmed);
    }
  }

  finalize(): string {
    this.flushPendingAssistantMessageAsAnswer();
    const response = this.messages.join("\n\n").trim();
    if (!response) {
      throw new Error("Agent completed without an assistant message");
    }
    return response;
  }

  private async flushPendingAssistantMessageAsProgress(): Promise<void> {
    const text = this.pendingAssistantMessage;
    if (!text) {
      return;
    }
    this.pendingAssistantMessage = undefined;
    await this.emit({ kind: "thinking", text });
  }

  private flushPendingAssistantMessageAsAnswer(): void {
    const text = this.pendingAssistantMessage;
    if (!text) {
      return;
    }
    this.pendingAssistantMessage = undefined;
    this.messages.push(text);
  }

  private async emit(update: AgentProgressUpdate): Promise<void> {
    await emitAgentProgress(this.options, update);
  }
}
