import type { Agent } from "./agent-session.js";
import type { AgentProviderStore } from "@core/runtime/agent-provider-store.js";

export interface AgentProviderDefinition {
  kind: string;
  displayName: string;
  buildAgent: () => Agent;
}

export interface WorkspaceProviderResult {
  definition: AgentProviderDefinition;
  /** Whether the provider is enabled for this workspace. */
  enabled: boolean;
  /** Reason when status is "disabled". */
  reason?: string;
}

export interface ProviderSelectedEvent {
  workspaceId: string;
  providerKey: string;
  timestamp: string;
}

export type ProviderSelectedListener = (event: ProviderSelectedEvent) => void;

/**
 * Tracks which agent providers are available (registered) and which one,
 * if any, the operator has explicitly activated. No automatic default —
 * callers must check active() before invoking an agent.
 *
 * When a workspace-scoped {@link AgentProviderStore} is configured via
 * {@link setWorkspaceStore}, {@link resolveInWorkspace} enforces
 * enable/disable state per workspace. Providers that exist at the process
 * level but are disabled for a workspace are rejected with a visible
 * denial reason.
 */
export class AgentProviderRegistry {
  private readonly providers = new Map<string, AgentProviderDefinition>();
  private activeKind: string | undefined;
  private workspaceStore: AgentProviderStore | undefined;
  private listeners = new Set<ProviderSelectedListener>();

  /**
   * Attach a workspace-scoped store. Once configured, {@link resolveInWorkspace}
   * gates provider access on workspace-level enablement.
   */
  setWorkspaceStore(store: AgentProviderStore): this {
    this.workspaceStore = store;
    return this;
  }

  register(definition: AgentProviderDefinition): this {
    if (this.providers.has(definition.kind)) {
      throw new Error(`agent provider already registered: ${definition.kind}`);
    }
    this.providers.set(definition.kind, { ...definition });
    return this;
  }

  unregister(kind: string): boolean {
    if (this.activeKind === kind) {
      this.activeKind = undefined;
    }
    return this.providers.delete(kind);
  }

  available(): AgentProviderDefinition[] {
    return Array.from(this.providers.values()).map((provider) => ({ ...provider }));
  }

  setActive(kind: string): void {
    if (!this.providers.has(kind)) {
      throw new Error(`agent provider not registered: ${kind}`);
    }
    this.activeKind = kind;
  }

  clearActive(): void {
    this.activeKind = undefined;
  }

  activeKindName(): string | undefined {
    return this.activeKind;
  }

  active(): AgentProviderDefinition | undefined {
    if (this.activeKind === undefined) {
      return undefined;
    }
    const provider = this.providers.get(this.activeKind);
    return provider ? { ...provider } : undefined;
  }

  resolve(kind: string): AgentProviderDefinition | undefined {
    const provider = this.providers.get(kind);
    return provider ? { ...provider } : undefined;
  }

  resolveActiveAgent(): Agent | undefined {
    const provider = this.active();
    return provider?.buildAgent();
  }

  /**
   * Resolve a provider within a workspace context. When a workspace store
   * is configured, the provider's enabled state is checked against the
   * workspace-scoped `agent_providers` table.
   *
   * Returns `{ definition, enabled: false, reason }` for disabled
   * providers so callers can surface visible denial evidence.
   */
  resolveInWorkspace(
    workspaceId: string,
    kind: string
  ): WorkspaceProviderResult | undefined {
    const definition = this.providers.get(kind);
    if (!definition) {
      return undefined;
    }

    if (!this.workspaceStore) {
      // No workspace store configured — defer to process-level state.
      return { definition: { ...definition }, enabled: true };
    }

    const record = this.workspaceStore.getByKey(workspaceId, kind);
    if (!record) {
      return {
        definition: { ...definition },
        enabled: false,
        reason: `provider "${kind}" is not registered in workspace "${workspaceId}"`
      };
    }

    if (!record.enabled) {
      return {
        definition: { ...definition },
        enabled: false,
        reason: `provider "${kind}" is disabled in workspace "${workspaceId}"`
      };
    }

    return { definition: { ...definition }, enabled: true };
  }

  /**
   * Emit a `agent.provider_selected` event when a provider is chosen for
   * execution. Callers should invoke this after resolving via
   * {@link resolveInWorkspace} and confirming the provider is enabled.
   */
  onProviderSelected(listener: ProviderSelectedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitProviderSelected(workspaceId: string, providerKey: string, timestamp: string): void {
    const event: ProviderSelectedEvent = { workspaceId, providerKey, timestamp };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Check if a provider is enabled for a given workspace.
   * Returns false when no workspace store is configured (backward-compatible
   * with process-level-only registries).
   */
  isEnabledForWorkspace(workspaceId: string, providerKey: string): boolean {
    if (!this.workspaceStore) {
      return true;
    }
    return this.workspaceStore.isProviderEnabled(workspaceId, providerKey);
  }
}
