import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { openRuntimeDb } from "@infra/app/runtime-db.js";
import { AgentProviderStore } from "@core/runtime/agent-provider-store.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, mkdtempSync } from "node:fs";

describe("AgentProviderStore", () => {
  let db: Database.Database;
  let store: AgentProviderStore;
  let ws: WorkspaceStore;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feegle-test-agent-provider-"));
    db = openRuntimeDb(join(dir, "test.db"));
    store = new AgentProviderStore(db);
    ws = new WorkspaceStore(db);
    const now = "2026-05-31T00:00:00.000Z";
    ws.createWorkspaceWithOwner({
      workspaceId: "ws_1",
      workspaceName: "Test Workspace",
      userId: "user_1",
      displayName: "Test User",
      now
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers a provider and retrieves it by key", () => {
    store.register({
      id: "ap_1",
      workspaceId: "ws_1",
      providerKey: "claude",
      displayName: "Claude Agent",
      capabilities: { modes: ["chat", "plan"] },
      now: "2026-05-31T00:00:00.000Z"
    });

    const record = store.getByKey("ws_1", "claude");
    expect(record).toBeDefined();
    expect(record!.displayName).toBe("Claude Agent");
    expect(record!.enabled).toBe(true);
    expect(record!.capabilities).toEqual({ modes: ["chat", "plan"] });
  });

  it("returns undefined for unknown provider key", () => {
    expect(store.getByKey("ws_1", "nonexistent")).toBeUndefined();
  });

  it("listByWorkspace returns all providers for a workspace", () => {
    store.register({
      id: "ap_1",
      workspaceId: "ws_1",
      providerKey: "claude",
      displayName: "Claude Agent",
      now: "2026-05-31T00:00:00.000Z"
    });
    store.register({
      id: "ap_2",
      workspaceId: "ws_1",
      providerKey: "openai",
      displayName: "OpenAI Agent",
      now: "2026-05-31T00:00:00.000Z"
    });

    // Register in another workspace
    ws.createWorkspaceWithOwner({
      workspaceId: "ws_2",
      workspaceName: "Other",
      userId: "user_2",
      displayName: "Other User",
      now: "2026-05-31T00:00:00.000Z"
    });
    store.register({
      id: "ap_3",
      workspaceId: "ws_2",
      providerKey: "gemini",
      displayName: "Gemini Agent",
      now: "2026-05-31T00:00:00.000Z"
    });

    const ws1Providers = store.listByWorkspace("ws_1");
    expect(ws1Providers).toHaveLength(2);
    expect(ws1Providers.map((p) => p.providerKey).sort()).toEqual(["claude", "openai"]);

    const ws2Providers = store.listByWorkspace("ws_2");
    expect(ws2Providers).toHaveLength(1);
    expect(ws2Providers[0].providerKey).toBe("gemini");
  });

  it("disables and re-enables a provider", () => {
    store.register({
      id: "ap_1",
      workspaceId: "ws_1",
      providerKey: "claude",
      displayName: "Claude Agent",
      now: "2026-05-31T00:00:00.000Z"
    });

    expect(store.isProviderEnabled("ws_1", "claude")).toBe(true);

    store.setEnabled({
      id: "ap_1",
      enabled: false,
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(store.isProviderEnabled("ws_1", "claude")).toBe(false);

    const record = store.getByKey("ws_1", "claude");
    expect(record!.enabled).toBe(false);

    store.setEnabled({
      id: "ap_1",
      enabled: true,
      now: "2026-05-31T00:02:00.000Z"
    });

    expect(store.isProviderEnabled("ws_1", "claude")).toBe(true);
  });

  it("upserts on register with same workspace and provider key", () => {
    store.register({
      id: "ap_1",
      workspaceId: "ws_1",
      providerKey: "claude",
      displayName: "Claude Agent v1",
      now: "2026-05-31T00:00:00.000Z"
    });

    store.register({
      id: "ap_1b",
      workspaceId: "ws_1",
      providerKey: "claude",
      displayName: "Claude Agent v2",
      capabilities: { modes: ["chat"] },
      now: "2026-05-31T00:01:00.000Z"
    });

    const record = store.getByKey("ws_1", "claude");
    expect(record!.displayName).toBe("Claude Agent v2");
    expect(record!.capabilities).toEqual({ modes: ["chat"] });
    expect(record!.updatedAt).toBe("2026-05-31T00:01:00.000Z");
  });

  it("getById retrieves a provider by its id", () => {
    store.register({
      id: "ap_custom_id",
      workspaceId: "ws_1",
      providerKey: "custom",
      displayName: "Custom Agent",
      now: "2026-05-31T00:00:00.000Z"
    });

    const record = store.getById("ap_custom_id");
    expect(record).toBeDefined();
    expect(record!.providerKey).toBe("custom");
  });

  it("returns false for isProviderEnabled when provider does not exist", () => {
    expect(store.isProviderEnabled("ws_1", "nonexistent")).toBe(false);
  });
});

describe("AgentProviderRegistry workspace scope integration", () => {
  let db: Database.Database;
  let agentStore: AgentProviderStore;
  let ws: WorkspaceStore;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feegle-test-agent-registry-"));
    db = openRuntimeDb(join(dir, "test.db"));
    agentStore = new AgentProviderStore(db);
    ws = new WorkspaceStore(db);
    const now = "2026-05-31T00:00:00.000Z";
    ws.createWorkspaceWithOwner({
      workspaceId: "ws_1",
      workspaceName: "Test Workspace",
      userId: "user_1",
      displayName: "Test User",
      now
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("disabled provider is reported with visible denial evidence", () => {
    // Register in workspace store as disabled
    agentStore.register({
      id: "ap_1",
      workspaceId: "ws_1",
      providerKey: "disabled-agent",
      displayName: "Disabled Agent",
      now: "2026-05-31T00:00:00.000Z"
    });
    agentStore.setEnabled({
      id: "ap_1",
      enabled: false,
      now: "2026-05-31T00:00:01.000Z"
    });

    const record = agentStore.getByKey("ws_1", "disabled-agent");
    expect(record).toBeDefined();
    expect(record!.enabled).toBe(false);

    const isEnabled = agentStore.isProviderEnabled("ws_1", "disabled-agent");
    expect(isEnabled).toBe(false);
  });
});
