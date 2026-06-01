import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { WorkbenchStore } from "@features/workbench/workbench-store.js";

describe("WorkbenchStore", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-workbench-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("returns an empty state with null requirementId for a new chatId", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    const state = store.getOrCreate("oc_new");
    expect(state).toEqual({
      chatId: "oc_new",
      repositories: [],
      requirementId: null,
      requirementText: null,
      requirementDocUrl: null,
      requirementVersion: 0,
      planText: null,
      planDocUrl: null,
      planVersion: 0,
      planStale: false,
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("adds and removes repositories", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.addRepository("oc_1", "https://git.example.com/a.git");
    store.addRepository("oc_1", "https://git.example.com/b.git");
    expect(store.getOrCreate("oc_1").repositories).toEqual([
      "https://git.example.com/a.git",
      "https://git.example.com/b.git",
    ]);

    store.removeRepository("oc_1", "https://git.example.com/a.git");
    expect(store.getOrCreate("oc_1").repositories).toEqual([
      "https://git.example.com/b.git",
    ]);
  });

  it("ignores duplicate repository additions", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.addRepository("oc_1", "https://git.example.com/a.git");
    store.addRepository("oc_1", "https://git.example.com/a.git");
    expect(store.getOrCreate("oc_1").repositories).toEqual([
      "https://git.example.com/a.git",
    ]);
  });

  it("sets requirement, persists requirementId, and bumps version", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.setRequirement("oc_1", "req_abc", "Build feature X", "https://docs.example.com/x");
    const state = store.getOrCreate("oc_1");
    expect(state.requirementId).toBe("req_abc");
    expect(state.requirementText).toBe("Build feature X");
    expect(state.requirementDocUrl).toBe("https://docs.example.com/x");
    expect(state.requirementVersion).toBe(1);

    store.setRequirement("oc_1", "req_abc", "Build feature X v2", "https://docs.example.com/x2");
    const updated = store.getOrCreate("oc_1");
    expect(updated.requirementId).toBe("req_abc");
    expect(updated.requirementText).toBe("Build feature X v2");
    expect(updated.requirementVersion).toBe(2);
  });

  it("clears requirementId when requirement is deleted", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.setRequirement("oc_1", "req_abc", "req", "https://docs.example.com/req");
    store.deleteRequirement("oc_1");
    const state = store.getOrCreate("oc_1");
    expect(state.requirementId).toBeNull();
  });

  it("sets plan and bumps version, clears planStale", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.setRequirement("oc_1", "req_abc", "req", "https://docs.example.com/req");
    store.markPlanStale("oc_1");
    expect(store.getOrCreate("oc_1").planStale).toBe(true);

    store.setPlan("oc_1", "# Plan v1", "https://docs.example.com/plan1");
    const state = store.getOrCreate("oc_1");
    expect(state.planText).toBe("# Plan v1");
    expect(state.planDocUrl).toBe("https://docs.example.com/plan1");
    expect(state.planVersion).toBe(1);
    expect(state.planStale).toBe(false);
  });

  it("marks plan stale", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.setPlan("oc_1", "# Plan", "https://docs.example.com/plan");
    store.markPlanStale("oc_1");
    expect(store.getOrCreate("oc_1").planStale).toBe(true);
  });

  it("deletes plan", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.setPlan("oc_1", "# Plan", "https://docs.example.com/plan");
    store.deletePlan("oc_1");
    const state = store.getOrCreate("oc_1");
    expect(state.planText).toBeNull();
    expect(state.planDocUrl).toBeNull();
    expect(state.planVersion).toBe(0);
    expect(state.planStale).toBe(false);
  });

  it("deletes requirement and plan together", () => {
    const store = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store.setRequirement("oc_1", "req_abc", "req", "https://docs.example.com/req");
    store.setPlan("oc_1", "# Plan", "https://docs.example.com/plan");
    store.deleteRequirement("oc_1");
    const state = store.getOrCreate("oc_1");
    expect(state.requirementText).toBeNull();
    expect(state.requirementDocUrl).toBeNull();
    expect(state.requirementVersion).toBe(0);
    expect(state.planText).toBeNull();
    expect(state.planVersion).toBe(0);
  });

  it("persists state across store instances", () => {
    const store1 = new WorkbenchStore(db, () => new Date("2026-06-01T00:00:00.000Z"));
    store1.addRepository("oc_1", "https://git.example.com/a.git");
    store1.setRequirement("oc_1", "req_abc", "req", "https://docs.example.com/req");

    const store2 = new WorkbenchStore(db, () => new Date("2026-06-01T01:00:00.000Z"));
    const state = store2.getOrCreate("oc_1");
    expect(state.repositories).toEqual(["https://git.example.com/a.git"]);
    expect(state.requirementId).toBe("req_abc");
    expect(state.requirementText).toBe("req");
  });
});
