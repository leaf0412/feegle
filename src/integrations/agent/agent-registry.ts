import type { AgentCli } from "./agent-cli.js";

export type AgentFactory = (record: Record<string, unknown>) => AgentCli;

const agentFactories = new Map<string, { factory: AgentFactory; displayName: string }>();

export function registerAgent(kind: string, displayName: string, factory: AgentFactory): void {
  if (agentFactories.has(kind)) {
    throw new Error(`agent already registered: ${kind}`);
  }
  agentFactories.set(kind, { factory, displayName });
}

export function createAgent(kind: string, record: Record<string, unknown>): AgentCli {
  const entry = agentFactories.get(kind);
  if (!entry) {
    const available = listAgentKinds().join(", ");
    throw new Error(`unknown agent kind: ${kind}, available: ${available}`);
  }
  return entry.factory(record);
}

export function listAgentKinds(): string[] {
  return Array.from(agentFactories.keys());
}

export function agentDisplayName(kind: string): string {
  const entry = agentFactories.get(kind);
  if (!entry) {
    const available = listAgentKinds().join(", ");
    throw new Error(`unknown agent kind: ${kind}, available: ${available}`);
  }
  return entry.displayName;
}
