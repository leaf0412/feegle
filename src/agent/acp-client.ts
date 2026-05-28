import type { Client } from "@agentclientprotocol/sdk";
import { translateAcpSessionUpdate } from "./acp-event-translation.js";
import type { AgentProgressUpdate } from "./agent-cli.js";

export interface AcpClientHooks {
  onProgress?: (update: AgentProgressUpdate) => void | Promise<void>;
  /** Called for each agent_message_chunk so the adapter accumulates the final answer. */
  onAnswerChunk: (chunk: string) => void;
}

/**
 * feegle's implementation of the ACP Client interface. Translates the agent's
 * outbound notifications into feegle's progress events; answers fs/permission
 * callbacks with conservative defaults (pick the first permission option;
 * fs/terminal not yet wired — error so misbehaviour is loud, not silent).
 */
export function buildAcpClient(hooks: AcpClientHooks): Client {
  return {
    async requestPermission(params) {
      const first = params.options?.[0]?.optionId;
      return { outcome: { outcome: "selected", optionId: first ?? "" } };
    },
    async sessionUpdate(params) {
      const translated = translateAcpSessionUpdate(params.update as unknown as Record<string, unknown>);
      if (!translated) return;
      if ("answerChunk" in translated) {
        hooks.onAnswerChunk(translated.answerChunk);
        return;
      }
      await hooks.onProgress?.(translated.progress);
    },
    async readTextFile() {
      throw new Error("fs.readTextFile not yet wired in feegle's ACP client");
    },
    async writeTextFile() {
      throw new Error("fs.writeTextFile not yet wired in feegle's ACP client");
    }
  };
}
