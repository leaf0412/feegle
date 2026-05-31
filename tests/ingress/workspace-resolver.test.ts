import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { WorkspaceStore } from "../../src/resources/workspace/workspace-store.js";
import { WorkspaceResolver } from "../../src/ingress/workspace-resolver.js";

describe("WorkspaceResolver", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: WorkspaceStore;
  let resolver: WorkspaceResolver;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-workspace-resolver-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));

    const now = "2026-05-31T00:00:00.000Z";
    store = new WorkspaceStore(db);
    store.createWorkspaceWithOwner({
      workspaceId: "ws_1",
      workspaceName: "Test Workspace",
      userId: "user_1",
      displayName: "Alice",
      now
    });
    store.bindConversation({
      conversationKey: "chat_abc",
      workspaceId: "ws_1",
      projectId: null,
      now
    });

    resolver = new WorkspaceResolver(store);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves a bound conversation to workspace scope", () => {
    const result = resolver.resolve({ conversationKey: "chat_abc" });

    expect(result).toEqual({
      status: "resolved",
      workspaceId: "ws_1",
      projectId: null,
      conversationKey: "chat_abc"
    });
  });

  it("returns missing_binding for an unbound conversation", () => {
    const result = resolver.resolve({ conversationKey: "unknown_chat" });

    expect(result).toEqual({
      status: "missing_binding",
      reason: "no binding for conversation unknown_chat"
    });
  });

  it("returns missing_binding when conversationHint is missing", () => {
    const result = resolver.resolve(undefined);

    expect(result).toEqual({
      status: "missing_binding",
      reason: "no conversation hint in trigger event"
    });
  });

  it("returns missing_binding when conversationHint lacks conversationKey", () => {
    const result = resolver.resolve({ other: "field" });

    expect(result).toEqual({
      status: "missing_binding",
      reason: "conversationHint missing conversationKey"
    });
  });
});
