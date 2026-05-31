import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { RequirementPlanStore } from "@plugins/requirement-workflow/requirement-plan-store.js";

describe("RequirementPlanStore", () => {
  let root: string;
  let db: RuntimeDb;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "feegle-requirement-plan-"));
    db = openRuntimeDb(join(root, "runtime.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("stores immutable plan versions", () => {
    const store = new RequirementPlanStore(db);
    const first = store.createVersion({
      requirementId: "reqwf_1",
      authorUserId: "agent",
      summary: "Initial plan",
      markdown: "# Plan\n\n- Task 1",
      source: "generated"
    });
    const second = store.createVersion({
      requirementId: "reqwf_1",
      authorUserId: "agent",
      summary: "Revised plan",
      markdown: "# Plan\n\n- Task 1\n- Task 2",
      source: "revision",
      feedback: "Add test plan"
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(store.latest("reqwf_1")).toEqual(second);
    expect(store.listVersions("reqwf_1").map((item) => item.version)).toEqual([1, 2]);

    const other = store.createVersion({
      requirementId: "reqwf_2",
      authorUserId: "agent",
      summary: "Other req",
      markdown: "# Other",
      source: "generated"
    });
    expect(other.version).toBe(1);
    expect(store.listVersions("reqwf_1")).toHaveLength(2);
  });

  it("rejects empty markdown and returns undefined for unknown requirement", () => {
    const store = new RequirementPlanStore(db);
    expect(() => store.createVersion({
      requirementId: "reqwf_x", authorUserId: "agent", summary: "s", markdown: "", source: "generated"
    })).toThrow("Plan markdown is required");
    expect(store.latest("reqwf_unknown")).toBeUndefined();
  });
});
