import type { AgentCli } from "./agent-cli.js";

export interface AgentProviderDefinition {
  kind: string;
  displayName: string;
  buildAgent: () => AgentCli;
}

/**
 * Tracks which agent providers are available (registered) and which one,
 * if any, the operator has explicitly activated. No automatic default —
 * callers must check active() before invoking an agent.
 */
export class AgentProviderRegistry {
  private readonly providers = new Map<string, AgentProviderDefinition>();
  private activeKind: string | undefined;

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

  resolveActiveAgent(): AgentCli | undefined {
    const provider = this.active();
    return provider?.buildAgent();
  }
}
