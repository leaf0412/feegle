import type { AgentProgressUpdate, AgentRunOptions } from "./agent-cli.js";

export async function emitAgentProgress(
  options: AgentRunOptions | undefined,
  update: AgentProgressUpdate
): Promise<void> {
  await options?.onProgress?.(update);
}
