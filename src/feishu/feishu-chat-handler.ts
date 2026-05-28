import type {
  AgentChatMessage,
  AgentCli,
  AgentProgressUpdate,
  AgentRunOptions
} from "../agent/agent-cli.js";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import { AgentLoadBalancer } from "../agent/agent-load-balancer.js";
import type { AgentProviderDefinition } from "../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../agent/chat-history-store.js";
import type { SessionStore } from "../agent/session-store.js";
import type { FeishuClientPort } from "./feishu-client.js";
import { FeishuPreviewSession } from "./feishu-preview-session.js";
import {
  buildCardJSONWithStatus,
  buildRichCard,
  buildRichCards,
  type FeishuRichCardStatus
} from "./feishu-rich-card.js";
import type { PlatformProgressToolStep } from "../platform/progress.js";

export interface FeishuChatHandlerDeps {
  client: FeishuClientPort;
  providers: AgentProviderRegistry;
  history: ChatHistoryStore;
  workspaceDir: string;
  sessionStore?: SessionStore;
  balancer?: AgentLoadBalancer;
  progressHeartbeatMs?: number;
  progressUpdateMinIntervalMs?: number;
  now?: () => number;
}

export interface FeishuChatRequest {
  chatId: string;
  triggerMessageId: string;
  sessionKey: string;
  userText: string;
}

export type FeishuChatResult =
  | { status: "delivered" }
  | { status: "no_provider" }
  | { status: "failed"; reason: string };

/**
 * Orchestrates a single chat turn:
 *   1) check active provider (no defaults — fail loudly when missing)
 *   2) open a preview card so the user sees the bot is working
 *   3) feed history + new message to the agent, streaming progress into the card
 *   4) finalise the card with the response and persist history
 */
export class FeishuChatHandler {
  private readonly now: () => number;
  private readonly balancer: AgentLoadBalancer;

  constructor(private readonly deps: FeishuChatHandlerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.balancer = deps.balancer ?? new AgentLoadBalancer();
  }

  async handle(request: FeishuChatRequest): Promise<FeishuChatResult> {
    const resolved = await this.resolveProviderForSession(request.sessionKey);
    if (!resolved) {
      await this.deps.client.replyText(
        request.triggerMessageId,
        "尚未注册任何 agent provider。请运行 /provider register codex cwd=<path> 注册一个。"
      );
      return { status: "no_provider" };
    }
    const { provider, switchNotice } = resolved;

    const cwd = this.deps.workspaceDir;

    const agent: AgentCli = provider.buildAgent();

    this.deps.history.append(request.sessionKey, { role: "user", content: request.userText });
    const messages = this.deps.history.get(request.sessionKey);

    const preview = new FeishuPreviewSession(this.deps.client, request.chatId);
    const renderState: PreviewRenderState = {
      provider: provider.displayName,
      steps: [],
      startedAt: this.now(),
      switchNotice
    };
    await preview.start(renderRichCard(renderState, "working", /* streaming */ true, this.now()), {
      replyToMessageId: request.triggerMessageId
    });

    const sessionStore = this.deps.sessionStore;
    const acpSessionId = sessionStore?.get(request.sessionKey)?.acpSessionId;
    const options: AgentRunOptions = {
      cwd,
      onProgress: async (update) => {
        applyProgress(renderState, update);
        await this.safeUpdate(preview, renderState, "working", true);
      },
      sessionContext: {
        acpSessionId,
        onAssign: sessionStore
          ? async (id) => {
              try {
                await sessionStore.setAcpSessionId(request.sessionKey, id);
              } catch (error) {
                console.warn("session acp id persistence failed", errorMessage(error));
              }
            }
          : undefined
      }
    };
    const stopHeartbeat = this.startProgressHeartbeat(preview, renderState);

    this.balancer.acquire(provider.kind);
    let answer: string;
    try {
      answer = (await agent.chat(messages, options)).trim();
    } catch (error) {
      stopHeartbeat();
      const reason = errorMessage(error);
      renderState.errorMessage = reason;
      await this.safeUpdate(preview, renderState, "error", false);
      return { status: "failed", reason };
    } finally {
      this.balancer.release(provider.kind);
    }

    stopHeartbeat();
    this.deps.history.append(request.sessionKey, { role: "assistant", content: answer });
    renderState.answer = answer;
    await this.safeFinish(preview, renderState, "done", false);
    return { status: "delivered" };
  }

  /**
   * Picks the provider for this session: an existing still-registered pin wins
   * (sticky); otherwise the balancer chooses the least-busy registered provider
   * and the choice is persisted. A pin pointing at an unregistered agent is
   * re-balanced and surfaced via switchNotice (never silently dropped). Returns
   * undefined only when no provider is registered.
   */
  private async resolveProviderForSession(
    sessionKey: string
  ): Promise<{ provider: AgentProviderDefinition; switchNotice?: string } | undefined> {
    const registered = this.deps.providers.available();
    if (registered.length === 0) {
      return undefined;
    }
    const registeredKinds = registered.map((entry) => entry.kind);
    const sessionStore = this.deps.sessionStore;

    if (!sessionStore) {
      const kind = this.balancer.select(registeredKinds);
      return { provider: this.deps.providers.resolve(kind)! };
    }

    const pinned = sessionStore.get(sessionKey)?.agentKind;
    if (pinned && registeredKinds.includes(pinned)) {
      try {
        await sessionStore.touch(sessionKey);
      } catch (error) {
        console.warn("session store touch failed", errorMessage(error));
      }
      return { provider: this.deps.providers.resolve(pinned)! };
    }

    const chosenKind = this.balancer.select(registeredKinds);
    const provider = this.deps.providers.resolve(chosenKind)!;
    try {
      await sessionStore.assignAgent(sessionKey, chosenKind);
    } catch (error) {
      console.warn("session agent assignment failed", errorMessage(error));
    }
    const switchNotice =
      pinned && !registeredKinds.includes(pinned)
        ? `原 agent ${pinned} 已下线，本次切换到 ${provider.displayName}`
        : undefined;
    return { provider, switchNotice };
  }

  private async safeUpdate(
    preview: FeishuPreviewSession,
    state: PreviewRenderState,
    status: FeishuRichCardStatus,
    streaming: boolean
  ): Promise<void> {
    if (!this.canUpdatePreviewNow(state)) {
      return;
    }
    try {
      await preview.update(renderRichCard(state, status, streaming, this.now()));
      state.lastPreviewUpdateAt = this.now();
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
      const [firstCard, ...continuationCards] = renderRichCards(state, status, streaming, this.now());
      await this.waitUntilPreviewUpdateAllowed(state);
      await preview.finish({ keepOnFinish: true, finalContent: firstCard });
      state.lastPreviewUpdateAt = this.now();
      await this.sendContinuationCards(preview.currentMessageId, continuationCards);
    } catch (error) {
      console.warn("Feishu chat preview finish failed", errorMessage(error));
    }
  }

  /**
   * Posts the overflow cards of a split answer as a reply chain: each card
   * replies to the message before it so Feishu threads them under the original
   * preview card. Stops if the platform stops returning message ids.
   */
  private async sendContinuationCards(
    firstMessageId: string | undefined,
    cards: ReadonlyArray<string>
  ): Promise<void> {
    let parentMessageId = firstMessageId;
    for (const card of cards) {
      if (parentMessageId === undefined) {
        return;
      }
      const replyId = await this.deps.client.replyInteractiveCard(parentMessageId, JSON.parse(card));
      parentMessageId = replyId ?? parentMessageId;
    }
  }

  private canUpdatePreviewNow(state: PreviewRenderState): boolean {
    const lastUpdateAt = state.lastPreviewUpdateAt;
    if (lastUpdateAt === undefined) {
      return true;
    }
    return this.now() - lastUpdateAt >= this.progressUpdateMinIntervalMs();
  }

  private async waitUntilPreviewUpdateAllowed(state: PreviewRenderState): Promise<void> {
    const lastUpdateAt = state.lastPreviewUpdateAt;
    if (lastUpdateAt === undefined) {
      return;
    }
    const remaining = this.progressUpdateMinIntervalMs() - (this.now() - lastUpdateAt);
    if (remaining > 0) {
      await delay(remaining);
    }
  }

  private progressUpdateMinIntervalMs(): number {
    return this.deps.progressUpdateMinIntervalMs ?? 1000;
  }

  private startProgressHeartbeat(preview: FeishuPreviewSession, state: PreviewRenderState): () => void {
    const heartbeatMs = this.deps.progressHeartbeatMs ?? 15_000;
    const timer = setInterval(() => {
      void this.safeUpdate(preview, state, "working", true);
    }, heartbeatMs);
    return () => clearInterval(timer);
  }
}

interface PreviewRenderState {
  provider: string;
  steps: PlatformProgressToolStep[];
  startedAt: number;
  switchNotice?: string;
  lastPreviewUpdateAt?: number;
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

/**
 * Renders the finished answer as one or more cards. A single card is returned
 * when it fits; an oversized answer is split across a panel-bearing first card
 * plus panel-less continuation cards so no content is dropped.
 */
function renderRichCards(
  state: PreviewRenderState,
  status: FeishuRichCardStatus,
  streaming: boolean,
  nowMs: number
): string[] {
  const elapsedMs = nowMs - state.startedAt;
  const markdown = composeMarkdown(state, status);
  try {
    return buildRichCards({ status, steps: state.steps, markdown, streaming, elapsedMs });
  } catch (error) {
    console.warn("Feishu chat rich card render failed, falling back", errorMessage(error));
    return [buildCardJSONWithStatus(markdown, status)];
  }
}

function composeMarkdown(state: PreviewRenderState, status: FeishuRichCardStatus): string {
  if (status === "error") {
    return state.errorMessage ?? "agent 调用失败";
  }
  if (status === "done") {
    const answer = state.answer ?? "（无输出）";
    return state.switchNotice ? `> ${state.switchNotice}\n\n${answer}` : answer;
  }
  return `${state.provider} 正在思考…`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
