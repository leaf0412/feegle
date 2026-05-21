import type {
  AgentChatMessage,
  AgentCli,
  AgentProgressUpdate,
  AgentRunOptions
} from "../agent/agent-cli.js";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../agent/chat-history-store.js";
import type { SessionStore } from "../agent/session-store.js";
import type { FeishuClientPort } from "./feishu-client.js";
import { FeishuPreviewSession } from "./feishu-preview-session.js";
import {
  buildCardJSONWithStatus,
  buildRichCard,
  type FeishuRichCardStatus
} from "./feishu-rich-card.js";
import type { PlatformProgressToolStep } from "../platform/progress.js";
import type { ChatBindingStore } from "../repositories/chat-binding-store.js";
import type { WorkspaceStore } from "../repositories/workspace-store.js";

export interface FeishuChatHandlerDeps {
  client: FeishuClientPort;
  providers: AgentProviderRegistry;
  history: ChatHistoryStore;
  sessionStore?: SessionStore;
  workspaceStore?: WorkspaceStore;
  chatBindingStore?: ChatBindingStore;
  now?: () => number;
}

export interface FeishuChatRequest {
  chatId: string;
  triggerMessageId: string;
  sessionKey: string;
  userText: string;
}

export interface FeishuChatResult {
  status: "delivered" | "no_provider" | "failed";
  reason?: string;
}

/**
 * Orchestrates a single chat turn:
 *   1) check active provider (no defaults — fail loudly when missing)
 *   2) open a preview card so the user sees the bot is working
 *   3) feed history + new message to the agent, streaming progress into the card
 *   4) finalise the card with the response and persist history
 */
export class FeishuChatHandler {
  private readonly now: () => number;

  constructor(private readonly deps: FeishuChatHandlerDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  async handle(request: FeishuChatRequest): Promise<FeishuChatResult> {
    const provider = this.deps.providers.active();
    if (!provider) {
      const available = this.deps.providers.available();
      const text =
        available.length === 0
          ? "尚未注册任何 agent provider。请运行 /provider register codex cwd=<path>，再 /provider use codex 激活。"
          : `已注册 ${available.map((p) => p.kind).join("、")}，但都未激活。运行 /provider use <kind> 激活一个。`;
      await this.deps.client.replyText(request.triggerMessageId, text);
      return { status: "no_provider" };
    }

    const agent: AgentCli = provider.buildAgent();
    if (this.deps.sessionStore) {
      try {
        await this.deps.sessionStore.getOrCreate(request.sessionKey, { agentKind: provider.kind });
        await this.deps.sessionStore.touch(request.sessionKey);
      } catch (error) {
        console.warn("session store touch failed", errorMessage(error));
      }
    }

    const cwd = resolveCwd(request.chatId, this.deps.workspaceStore, this.deps.chatBindingStore);

    this.deps.history.append(request.sessionKey, { role: "user", content: request.userText });
    const messages = this.deps.history.get(request.sessionKey);

    const preview = new FeishuPreviewSession(this.deps.client, request.chatId);
    const renderState: PreviewRenderState = {
      provider: provider.displayName,
      steps: [],
      startedAt: this.now()
    };
    await preview.start(renderRichCard(renderState, "working", /* streaming */ true, this.now()), {
      replyToMessageId: request.triggerMessageId
    });

    const options: AgentRunOptions = {
      cwd,
      onProgress: async (update) => {
        applyProgress(renderState, update);
        await this.safeUpdate(preview, renderState, "working", true);
      }
    };

    let answer: string;
    try {
      answer = (await agent.chat(messages, options)).trim();
    } catch (error) {
      const reason = errorMessage(error);
      renderState.errorMessage = reason;
      await this.safeUpdate(preview, renderState, "error", false);
      return { status: "failed", reason };
    }

    this.deps.history.append(request.sessionKey, { role: "assistant", content: answer });
    renderState.answer = answer;
    await this.safeFinish(preview, renderState, "done", false);
    return { status: "delivered" };
  }

  private async safeUpdate(
    preview: FeishuPreviewSession,
    state: PreviewRenderState,
    status: FeishuRichCardStatus,
    streaming: boolean
  ): Promise<void> {
    try {
      await preview.update(renderRichCard(state, status, streaming, this.now()));
    } catch (error) {
      console.warn("Feishu chat preview update failed", errorMessage(error));
    }
  }

  private async safeFinish(
    preview: FeishuPreviewSession,
    state: PreviewRenderState,
    status: FeishuRichCardStatus,
    streaming: boolean
  ): Promise<void> {
    try {
      await preview.finish({
        keepOnFinish: true,
        finalContent: renderRichCard(state, status, streaming, this.now())
      });
    } catch (error) {
      console.warn("Feishu chat preview finish failed", errorMessage(error));
    }
  }
}

interface PreviewRenderState {
  provider: string;
  steps: PlatformProgressToolStep[];
  startedAt: number;
  answer?: string;
  errorMessage?: string;
}

function applyProgress(state: PreviewRenderState, update: AgentProgressUpdate): void {
  if (update.kind === "tool_use") {
    state.steps.push({
      kind: "tool_step",
      name: update.tool ?? "Tool",
      summary: update.text,
      status: "running"
    });
    return;
  }
  if (update.kind === "tool_result") {
    const lastIndex = findLastMatchingStep(state.steps, update.tool);
    if (lastIndex >= 0) {
      const previous = state.steps[lastIndex];
      state.steps[lastIndex] = { ...previous, status: "ok", result: update.text };
    } else {
      state.steps.push({ kind: "tool_step", name: update.tool ?? "Tool", status: "ok", result: update.text });
    }
    return;
  }
  if (update.kind === "thinking") {
    state.steps.push({ kind: "tool_step", name: "Thinking", summary: update.text });
    return;
  }
  if (update.kind === "error") {
    state.errorMessage = update.text;
  }
}

function findLastMatchingStep(steps: ReadonlyArray<PlatformProgressToolStep>, tool: string | undefined): number {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status === "running" && steps[i].name === (tool ?? steps[i].name)) {
      return i;
    }
  }
  return -1;
}

function renderRichCard(
  state: PreviewRenderState,
  status: FeishuRichCardStatus,
  streaming: boolean,
  nowMs: number
): string {
  const elapsedMs = nowMs - state.startedAt;
  const markdown = composeMarkdown(state, status);
  try {
    return buildRichCard({
      status,
      steps: state.steps,
      markdown,
      streaming,
      elapsedMs
    });
  } catch (error) {
    console.warn("Feishu chat rich card render failed, falling back", errorMessage(error));
    return buildCardJSONWithStatus(markdown, status);
  }
}

function composeMarkdown(state: PreviewRenderState, status: FeishuRichCardStatus): string {
  if (status === "error") {
    return state.errorMessage ?? "agent 调用失败";
  }
  if (status === "done") {
    return state.answer ?? "（无输出）";
  }
  return `${state.provider} 正在思考…`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveCwd(
  chatId: string,
  workspaceStore?: WorkspaceStore,
  chatBindingStore?: ChatBindingStore
): string | undefined {
  if (!workspaceStore || !chatBindingStore) return undefined;
  const binding = chatBindingStore.get(chatId);
  if (!binding?.workspaceId) return undefined;
  const workspace = workspaceStore.get(binding.workspaceId);
  return workspace?.path;
}
