import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { RequirementPlanStore } from "@plugins/requirement-workflow/requirement-plan-store.js";
import { RequirementPlanningService } from "@plugins/requirement-workflow/requirement-planning-service.js";

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

describe("RequirementPlanningService", () => {
  it("generates a first plan through the agent capability", async () => {
    const runPlanGeneration = vi.fn().mockResolvedValue({
      summary: "Build requirement workflow",
      markdown: "# Plan\n\n- Add plugin\n- Add tests"
    });
    const planStore = {
      createVersion: vi.fn((input) => ({ ...input, planId: "plan_1", version: 1, createdAt: "2026-05-31T00:00:00.000Z" }))
    };

    const service = new RequirementPlanningService({
      planStore: planStore as never,
      agent: { runPlanGeneration } as never
    });

    const result = await service.generatePlan({
      requirementId: "reqwf_1",
      requesterUserId: "user_1",
      requirementText: "Need workflow plugin"
    });

    expect(runPlanGeneration).toHaveBeenCalledWith({
      requirementId: "reqwf_1",
      requirementText: "Need workflow plugin"
    });
    expect(result.version).toBe(1);
    expect(planStore.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      requirementId: "reqwf_1",
      authorUserId: "agent",
      source: "generated"
    }));
  });

  it("revises the latest plan through the agent capability", async () => {
    const runPlanRevision = vi.fn().mockResolvedValue({ summary: "Revised", markdown: "# Plan v2" });
    const planStore = {
      latest: vi.fn().mockReturnValue({ planId: "plan_1", requirementId: "reqwf_1", version: 1, markdown: "# Plan v1", source: "generated" }),
      createVersion: vi.fn((input) => ({ ...input, planId: "plan_2", version: 2, createdAt: "2026-05-31T00:00:01.000Z" }))
    };
    const service = new RequirementPlanningService({
      planStore: planStore as never,
      agent: { runPlanRevision } as never
    });

    const result = await service.revisePlan({
      requirementId: "reqwf_1",
      requesterUserId: "user_1",
      requirementText: "Need workflow plugin",
      feedback: "Add test plan"
    });

    expect(runPlanRevision).toHaveBeenCalledWith({
      requirementId: "reqwf_1",
      requirementText: "Need workflow plugin",
      currentPlanMarkdown: "# Plan v1",
      feedback: "Add test plan"
    });
    expect(result.version).toBe(2);
    expect(planStore.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      requirementId: "reqwf_1",
      authorUserId: "agent",
      source: "revision",
      feedback: "Add test plan"
    }));
  });

  it("revisePlan throws when no plan exists", async () => {
    const planStore = { latest: vi.fn().mockReturnValue(undefined), createVersion: vi.fn() };
    const service = new RequirementPlanningService({
      planStore: planStore as never,
      agent: { runPlanRevision: vi.fn() } as never
    });
    await expect(service.revisePlan({
      requirementId: "reqwf_missing", requesterUserId: "user_1", requirementText: "x", feedback: "y"
    })).rejects.toThrow("No plan exists for requirement: reqwf_missing");
    expect(planStore.createVersion).not.toHaveBeenCalled();
  });
});
