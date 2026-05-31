import type { WorkspaceStore } from "@resources/workspace/workspace-store.js";

export type ResolvedWorkspace =
  | { status: "resolved"; workspaceId: string; projectId: string | null; conversationKey: string }
  | { status: "missing_binding"; reason: string };

export interface WorkspaceResolverPort {
  resolve(conversationHint: Record<string, unknown> | undefined): ResolvedWorkspace;
}

export class WorkspaceResolver implements WorkspaceResolverPort {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  resolve(
    conversationHint: Record<string, unknown> | undefined
  ): ResolvedWorkspace {
    if (!conversationHint) {
      return { status: "missing_binding", reason: "no conversation hint in trigger event" };
    }

    const conversationKey = conversationHint.conversationKey;
    if (typeof conversationKey !== "string") {
      return { status: "missing_binding", reason: "conversationHint missing conversationKey" };
    }

    const binding = this.workspaceStore.getConversationBinding(conversationKey);
    if (!binding) {
      return { status: "missing_binding", reason: `no binding for conversation ${conversationKey}` };
    }

    const workspace = this.workspaceStore.getWorkspace(binding.workspaceId);
    if (!workspace) {
      return { status: "missing_binding", reason: `workspace not found: ${binding.workspaceId}` };
    }

    return {
      status: "resolved",
      workspaceId: binding.workspaceId,
      projectId: binding.projectId,
      conversationKey: binding.conversationKey
    };
  }
}
