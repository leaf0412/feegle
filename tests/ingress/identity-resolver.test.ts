import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { IdentityResolver } from "../../src/ingress/identity-resolver.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";

describe("IdentityResolver", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: WorkspaceStore;
  let resolver: IdentityResolver;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-identity-resolver-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));

    const now = "2026-05-31T00:00:00.000Z";
    // Seed a user with an external identity
    store = new WorkspaceStore(db);
    store.createWorkspaceWithOwner({
      workspaceId: "ws_1",
      workspaceName: "Test Workspace",
      userId: "user_1",
      displayName: "Alice",
      now
    });
    store.linkExternalIdentity({
      provider: "feishu",
      externalUserId: "ou_abc123",
      userId: "user_1",
      now
    });

    resolver = new IdentityResolver(store);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves a known external identity", () => {
    const result = resolver.resolve({
      provider: "feishu",
      externalUserId: "ou_abc123"
    });

    expect(result).toEqual({
      status: "resolved",
      userId: "user_1",
      displayName: "Alice"
    });
  });

  it("returns unknown for an unrecognized external identity", () => {
    const result = resolver.resolve({
      provider: "feishu",
      externalUserId: "ou_unknown"
    });

    expect(result).toEqual({
      status: "unknown",
      reason: "no external identity for feishu:ou_unknown"
    });
  });

  it("returns unknown when actorHint is missing", () => {
    const result = resolver.resolve(undefined);

    expect(result).toEqual({
      status: "unknown",
      reason: "no actor hint in trigger event"
    });
  });

  it("returns unknown when actorHint lacks provider or externalUserId", () => {
    const result = resolver.resolve({ other: "field" });

    expect(result).toEqual({
      status: "unknown",
      reason: "actorHint missing provider or externalUserId"
    });
  });
});
