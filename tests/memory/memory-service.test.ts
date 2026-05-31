import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { MemoryService } from "@core/memory/memory-service.js";
import { MemoryStore } from "@core/memory/memory-store.js";

describe("MemoryService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: MemoryStore;
  let service: MemoryService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-memory-service-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new MemoryStore(db);
    service = new MemoryService(store);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("approves a pending candidate", () => {
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "Use pnpm",
      source: {},
      confidence: 0.9,
      now: "2026-05-31T00:00:00.000Z"
    });

    service.approve("mem_1", "2026-05-31T00:01:00.000Z");
    expect(store.getById("mem_1")?.status).toBe("active");
  });

  it("rejects a pending candidate", () => {
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "Use yarn",
      source: {},
      confidence: 0.5,
      now: "2026-05-31T00:00:00.000Z"
    });

    service.reject("mem_1", "2026-05-31T00:01:00.000Z");
    expect(store.getById("mem_1")?.status).toBe("rejected");
  });

  it("throws when approving non-pending memory", () => {
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "run",
      kind: "fact",
      content: "auto-active",
      source: {},
      confidence: 1,
      now: "2026-05-31T00:00:00.000Z"
    });

    expect(() => service.approve("mem_1", "now")).toThrow("not pending approval");
  });

  it("searches active memory by query string", () => {
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "run",
      kind: "preference",
      content: "prefer pnpm over npm",
      source: {},
      confidence: 1,
      now: "2026-05-31T00:00:00.000Z"
    });
    store.createCandidate({
      id: "mem_2",
      workspaceId: "ws_1",
      scope: "run",
      kind: "fact",
      content: "uses TypeScript",
      source: {},
      confidence: 1,
      now: "2026-05-31T00:00:00.000Z"
    });

    const results = service.searchActive({ workspaceId: "ws_1", query: "pnpm" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("mem_1");
  });

  it("filters by scope", () => {
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "run",
      kind: "fact",
      content: "test timeout 30s",
      source: {},
      confidence: 1,
      now: "2026-05-31T00:00:00.000Z"
    });
    store.createCandidate({
      id: "mem_2",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "need approval",
      source: {},
      confidence: 0.8,
      now: "2026-05-31T00:00:00.000Z"
    });

    // Only mem_1 is active (run scope is auto-approved)
    const results = service.searchActive({ workspaceId: "ws_1", scope: "run" });
    expect(results).toHaveLength(1);
    expect(results[0].scope).toBe("run");
  });
});
