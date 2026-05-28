import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION
} from "@agentclientprotocol/sdk";
import { buildAcpClient } from "./acp-client.js";
import type {
  AgentChatMessage,
  AgentCli,
  AgentRepositoryContext,
  AgentRequirementContext,
  AgentRunOptions,
  DevelopmentTaskResult,
  PlanGenerationResult,
  PrototypeGenerationResult
} from "./agent-cli.js";

export interface AcpAgentAdapterOptions {
  command: string;
  args?: ReadonlyArray<string>;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

/**
 * Universal feegle agent adapter that drives any ACP-compliant agent CLI over
 * a spawned subprocess via @agentclientprotocol/sdk. Each AgentCli method
 * opens a fresh ACP session, sends one prompt, accumulates the streamed
 * answer, and tears the subprocess down. Multi-turn session resume is added
 * in a later task.
 */
export class AcpAgentAdapter implements AgentCli {
  constructor(private readonly opts: AcpAgentAdapterOptions) {}

  async chat(messages: ReadonlyArray<AgentChatMessage>, options?: AgentRunOptions): Promise<string> {
    return this.promptOnce(flattenChat(messages), options);
  }

  async generatePrototype(
    context: AgentRequirementContext,
    options?: AgentRunOptions
  ): Promise<PrototypeGenerationResult> {
    return this.promptOnce(promptForPrototype(context), options);
  }

  async generatePlan(
    context: AgentRequirementContext,
    options?: AgentRunOptions
  ): Promise<PlanGenerationResult> {
    return this.promptOnce(promptForPlan(context), options);
  }

  async runDevelopmentTask(
    context: AgentRequirementContext,
    repository: AgentRepositoryContext,
    task: string,
    options?: AgentRunOptions
  ): Promise<DevelopmentTaskResult> {
    return this.promptOnce(promptForDevelopmentTask(context, repository, task), options);
  }

  private async promptOnce(text: string, options?: AgentRunOptions): Promise<string> {
    const cwd = options?.cwd ?? process.cwd();
    const child = spawn(this.opts.command, [...(this.opts.args ?? [])], {
      cwd,
      env: { ...process.env, ...(this.opts.env ?? {}) },
      stdio: ["pipe", "pipe", "inherit"]
    });
    let answer = "";
    // ndJsonStream(output, input) — writable first, then readable.
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>
    );
    const conn = new ClientSideConnection(
      () =>
        buildAcpClient({
          onProgress: options?.onProgress,
          onAnswerChunk: (chunk) => {
            answer += chunk;
          }
        }),
      stream
    );

    const timeoutMs = this.opts.timeoutMs ?? 5 * 60_000;
    const deadline = setTimeout(() => child.kill(), timeoutMs);
    try {
      await conn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false
        }
      });
      const session = await conn.newSession({ cwd, mcpServers: [] });
      await conn.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text }]
      });
    } finally {
      clearTimeout(deadline);
      child.kill();
    }
    return answer.trim();
  }
}

function flattenChat(messages: ReadonlyArray<AgentChatMessage>): string {
  // First cut: serialize the conversation to plain text. Multi-turn semantics
  // (true session resume) lands in a later task.
  return messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
}

function promptForPrototype(c: AgentRequirementContext): string {
  return `Generate a clickable prototype for the following requirement.\n\nID: ${c.requirementId}\nTitle: ${c.title}\n\n${c.requirementText}`;
}

function promptForPlan(c: AgentRequirementContext): string {
  return `Generate an implementation plan for:\n\n${c.title}\n\n${c.requirementText}`;
}

function promptForDevelopmentTask(
  c: AgentRequirementContext,
  r: AgentRepositoryContext,
  task: string
): string {
  return `Work on the following task in the repository at ${r.localPath} (branch ${r.branchName}).\n\nRequirement: ${c.title}\n${c.requirementText}\n\nTask: ${task}`;
}
