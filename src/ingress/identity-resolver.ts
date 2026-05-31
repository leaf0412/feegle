import type { WorkspaceStore } from "../resources/workspace/workspace-store.js";

export type ResolvedIdentity =
  | { status: "resolved"; userId: string; displayName: string }
  | { status: "unknown"; reason: string };

export interface IdentityResolverPort {
  resolve(actorHint: Record<string, unknown> | undefined): ResolvedIdentity;
}

export class IdentityResolver implements IdentityResolverPort {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  resolve(
    actorHint: Record<string, unknown> | undefined
  ): ResolvedIdentity {
    if (!actorHint) {
      return { status: "unknown", reason: "no actor hint in trigger event" };
    }

    const provider = actorHint.provider;
    const externalUserId = actorHint.externalUserId;
    if (typeof provider !== "string" || typeof externalUserId !== "string") {
      return { status: "unknown", reason: "actorHint missing provider or externalUserId" };
    }

    const externalIdentity = this.workspaceStore.getExternalIdentity(provider, externalUserId);
    if (!externalIdentity) {
      return { status: "unknown", reason: `no external identity for ${provider}:${externalUserId}` };
    }

    const user = this.workspaceStore.getUser(externalIdentity.userId);
    if (!user) {
      return { status: "unknown", reason: `user not found for identity ${externalIdentity.id}` };
    }

    return { status: "resolved", userId: user.id, displayName: user.displayName };
  }
}
