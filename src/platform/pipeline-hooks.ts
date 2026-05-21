export interface PipelineHooks {
  onAgentPrompt?(handlerId: string, prompt: string): void;
  onAgentResponse?(handlerId: string, response: string): void;
  onAgentError?(handlerId: string, error: unknown): void;
}

export const consolePipelineHooks: PipelineHooks = {
  onAgentPrompt(handlerId, prompt) {
    console.log(`[pipeline] >>> agent prompt (${handlerId}):\n${prompt}`);
  },
  onAgentResponse(handlerId, response) {
    console.log(`[pipeline] <<< agent response (${handlerId}):\n${response}`);
  },
  onAgentError(handlerId, error) {
    console.error(`[pipeline] agent error (${handlerId}):`, error);
  }
};
