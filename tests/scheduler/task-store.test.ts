import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { TaskStore } from "../../src/features/scheduler/task-store.js";
import type { Task } from "../../src/features/scheduler/task.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `task-${id}`,
    kind: "heartbeat",
    params: {},
    cron: "0 9 * * *",
    timezone: "Asia/Shanghai",
    activeHours: null,
    target: null,
    enabled: true,
    source: "seed",
    errorPolicy: "on-change",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    lastRun: null,
    consecutiveFailures: 0,
    lastErrorNotifiedAt: null,
    ...overrides
  };
}

describe("TaskStore", () => {
  let db: RuntimeDb;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("list returns empty when no tasks have been stored", () => {
    const store = new TaskStore(db);
    expect(store.list()).toEqual([]);
  });

  it("get returns undefined for a missing id", () => {
    const store = new TaskStore(db);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("upsert inserts a new task and list returns it", async () => {
    const store = new TaskStore(db);
    const task = makeTask("01AAA");
    await store.upsert(task);
    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("01AAA");
    expect(listed[0]!.name).toBe("task-01AAA");
  });

  it("upsert updates an existing task (update semantics)", async () => {
    const store = new TaskStore(db);
    await store.upsert(makeTask("01AAA"));
    await store.upsert({ ...makeTask("01AAA"), name: "custom" });
    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.name).toBe("custom");
  });

  it("get returns the stored task with full field fidelity", async () => {
    const store = new TaskStore(db);
    const task = makeTask("01AAA", {
      enabled: false,
      source: "user",
      errorPolicy: "always",
      consecutiveFailures: 3,
      lastErrorNotifiedAt: "2026-05-20T00:00:00.000Z",
      activeHours: ["09:00", "17:00"],
      target: { platform: "feishu", chatId: "oc_abc" },
      lastRun: { at: "2026-05-19T00:00:00.000Z", status: "ok", durationMs: 42 }
    });
    await store.upsert(task);
    const retrieved = store.get("01AAA");
    expect(retrieved).toBeDefined();
    expect(retrieved!.enabled).toBe(false);
    expect(retrieved!.source).toBe("user");
    expect(retrieved!.errorPolicy).toBe("always");
    expect(retrieved!.consecutiveFailures).toBe(3);
    expect(retrieved!.lastErrorNotifiedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(retrieved!.activeHours).toEqual(["09:00", "17:00"]);
    expect(retrieved!.target).toEqual({ platform: "feishu", chatId: "oc_abc" });
    expect(retrieved!.lastRun).toEqual({
      at: "2026-05-19T00:00:00.000Z",
      status: "ok",
      durationMs: 42
    });
  });

  it("remove deletes the task by id", async () => {
    const store = new TaskStore(db);
    await store.upsert(makeTask("01AAA"));
    await store.upsert(makeTask("01BBB"));
    await store.remove("01AAA");
    expect(store.get("01AAA")).toBeUndefined();
    expect(store.get("01BBB")).toBeDefined();
    expect(store.list()).toHaveLength(1);
  });

  it("remove is idempotent — removing a missing id does not throw", async () => {
    const store = new TaskStore(db);
    await expect(store.remove("ghost")).resolves.toBeUndefined();
  });

  it("ensureSeed inserts new tasks and skips already-present tasks", async () => {
    const store = new TaskStore(db);
    await store.ensureSeed([makeTask("01AAA")]);
    // upsert overwrites so "01AAA" now has a custom name
    await store.upsert({ ...makeTask("01AAA"), name: "custom" });
    // ensureSeed should NOT overwrite "01AAA" again, and should insert "01BBB"
    await store.ensureSeed([makeTask("01AAA"), makeTask("01BBB")]);
    expect(store.list().map((t) => t.name)).toEqual(["custom", "task-01BBB"]);
  });

  it("params round-trip: nested objects, arrays, and nulls survive JSON encode/decode", async () => {
    const store = new TaskStore(db);
    const complexParams = {
      str: "hello",
      num: 42,
      flag: false,
      nullable: null,
      nested: { a: 1, b: [2, 3] },
      arr: [{ x: true }, { x: false }]
    };
    await store.upsert(makeTask("01CCC", { params: complexParams }));
    const retrieved = store.get("01CCC");
    expect(retrieved!.params).toEqual(complexParams);
  });

  it("enabled boolean marshals correctly — false becomes 0 and round-trips back to false", async () => {
    const store = new TaskStore(db);
    await store.upsert(makeTask("disabled", { enabled: false }));
    await store.upsert(makeTask("enabled", { enabled: true }));
    expect(store.get("disabled")!.enabled).toBe(false);
    expect(store.get("enabled")!.enabled).toBe(true);
  });

  it("list is ordered by created_at", async () => {
    const store = new TaskStore(db);
    await store.upsert(makeTask("late", { createdAt: "2026-05-20T00:00:00.000Z" }));
    await store.upsert(makeTask("early", { createdAt: "2026-05-18T00:00:00.000Z" }));
    expect(store.list().map((t) => t.id)).toEqual(["early", "late"]);
  });
});
