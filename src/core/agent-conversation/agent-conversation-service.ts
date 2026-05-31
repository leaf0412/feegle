import { AgentLoadBalancer } from "@integrations/agent/agent-load-balancer.js";
import type { AgentProgressUpdate, AgentRunOptions } from "@integrations/agent/agent-cli.js";
import type {
  AgentProviderDefinition,
  AgentProviderRegistry
} from "@integrations/agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import type { SessionStore } from "@integrations/agent/session-store.js";
import type {
  AgentConversationInput,
  AgentConversationProgress,
  AgentConversationResult
} from "./agent-conversation-models.js";

export interface AgentConversationRunner {
  run(input: AgentConversationInput): Promise<AgentConversationResult>;
}

export interface AgentConversationServiceDeps {
  providers: AgentProviderRegistry;
  history: ChatHistoryStore;
  sessionStore?: SessionStore;
  workspaceDir: string;
  balancer?: AgentLoadBalancer;
  now?: () => number;
}

export class AgentConversationService implements AgentConversationRunner {
  private readonly balancer: AgentLoadBalancer;
  private readonly now: () => number;

  constructor(private readonly deps: AgentConversationServiceDeps) {
    this.balancer = deps.balancer ?? new AgentLoadBalancer();
    this.now = deps.now ?? (() => Date.now());
  }

  async run(input: AgentConversationInput): Promise<AgentConversationResult> {
    const progress: AgentConversationProgress[] = [];
    const resolved = await this.resolveProvider(input.sessionKey);
    if (!resolved) {
      return {
        status: "no_provider",
        reason: "no agent provider registered",
        progress
      };
    }

    const { provider, switchNotice } = resolved;
    progress.push({
      type: "started",
      provider: provider.displayName,
      message: switchNotice,
      at: this.nowIso()
    });

    this.deps.history.append(input.sessionKey, { role: "user", content: input.userText });
    const messages = this.deps.history.get(input.sessionKey);
    const agent = provider.buildAgent();
    const options: AgentRunOptions = {
      cwd: this.deps.workspaceDir,
      onProgress: async (update) => {
        progress.push(this.toConversationProgress(provider.displayName, update));
      }
    };

    this.balancer.acquire(provider.kind);
    try {
      const answer = (await agent.chat(messages, options)).trim();
      this.deps.history.append(input.sessionKey, { role: "assistant", content: answer });
      return {
        status: "delivered",
        provider: provider.displayName,
        answer,
        messages,
        progress,
        switchNotice
      };
    } catch (error) {
      return {
        status: "failed",
        provider: provider.displayName,
        reason: errorMessage(error),
        progress
      };
    } finally {
      this.balancer.release(provider.kind);
    }
  }

  private async resolveProvider(
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
      await sessionStore.touch(sessionKey);
      return { provider: this.deps.providers.resolve(pinned)! };
    }

    const chosenKind = this.balancer.select(registeredKinds);
    const provider = this.deps.providers.resolve(chosenKind)!;
    await sessionStore.assignAgent(sessionKey, chosenKind);
    const switchNotice =
      pinned && !registeredKinds.includes(pinned)
        ? `原 agent ${pinned} 已下线，本次切换到 ${provider.displayName}`
        : undefined;
    return { provider, switchNotice };
  }

  private toConversationProgress(
    provider: string,
    update: AgentProgressUpdate
  ): AgentConversationProgress {
    return {
      type: "progress",
      provider,
      at: this.nowIso(),
      ...update
    };
  }

  private nowIso(): string {
    return new Date(this.now()).toISOString();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
