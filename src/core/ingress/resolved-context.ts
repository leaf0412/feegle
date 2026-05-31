/**
 * Fully resolved interaction context produced by the ingress identity + workspace
 * pipeline. Every external interaction must resolve to a durable workspace, user,
 * and optional project before runtime execution. Hardcoded workspace IDs are
 * not permitted in any code path.
 */
export interface ResolvedInteractionContext {
  workspaceId: string;
  projectId: string | null;
  userId: string;
  externalIdentity?: { provider: string; externalId: string };
  sourcePlugin: string;
  sourceId: string;
}
