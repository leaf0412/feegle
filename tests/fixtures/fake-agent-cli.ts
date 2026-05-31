/**
 * Fake agent CLI that returns deterministic responses.
 * Used in E2E tests to simulate agent-prompt effects without real external processes.
 */
export class FakeAgentCli {
  private _response: string = "agent response";
  private _usage: { inputTokens: number; outputTokens: number } = { inputTokens: 1, outputTokens: 1 };
  prompts: string[] = [];

  setResponse(text: string): void {
    this._response = text;
  }

  setUsage(usage: { inputTokens: number; outputTokens: number }): void {
    this._usage = usage;
  }

  async run(prompt: string): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    this.prompts.push(prompt);
    return { text: this._response, usage: this._usage };
  }

  reset(): void {
    this.prompts = [];
    this._response = "agent response";
    this._usage = { inputTokens: 1, outputTokens: 1 };
  }
}
