import { describe, expect, it } from "vitest";
import type { ChatWorkbenchState } from "@features/workbench/workbench-models.js";
import { renderWorkbenchCard } from "@features/workbench/workbench-card.js";
import type { PlatformCard, PlatformCardElement, PlatformCardButton } from "@platform/platform-card.js";

function emptyState(overrides: Partial<ChatWorkbenchState> = {}): ChatWorkbenchState {
  return {
    chatId: "oc_test",
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
    ...overrides,
  };
}

function getAllButtons(card: PlatformCard): PlatformCardButton[] {
  return card.elements
    .filter((el): el is Extract<PlatformCardElement, { kind: "actions" }> => el.kind === "actions")
    .flatMap((el) => (el as { buttons: PlatformCardButton[] }).buttons);
}

function getMarkdowns(card: PlatformCard): string[] {
  return card.elements
    .filter((el): el is Extract<PlatformCardElement, { kind: "markdown" }> => el.kind === "markdown")
    .map((el) => (el as { content: string }).content);
}

function buttonActions(card: PlatformCard): string[] {
  return getAllButtons(card).map((b) => b.action);
}

describe("renderWorkbenchCard", () => {
  it("renders header with title 工作台", () => {
    const card = renderWorkbenchCard(emptyState());
    expect(card.header?.title).toBe("工作台");
  });

  it("shows header color blue for empty state", () => {
    const card = renderWorkbenchCard(emptyState());
    expect(card.header?.color).toBe("blue");
  });

  it("shows header color green when plan exists", () => {
    const card = renderWorkbenchCard(emptyState({ planText: "plan" }));
    expect(card.header?.color).toBe("green");
  });

  it("shows header color orange when planStale", () => {
    const card = renderWorkbenchCard(emptyState({ planText: "plan", planStale: true }));
    expect(card.header?.color).toBe("orange");
  });

  it("shows repo count in markdown for empty state", () => {
    const card = renderWorkbenchCard(emptyState());
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("仓库");
    expect(md).toContain("0");
  });

  it("shows repository list when repos exist", () => {
    const card = renderWorkbenchCard(emptyState({ repositories: ["repo1", "repo2"] }));
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("2");
    expect(md).toContain("repo1");
    expect(md).toContain("repo2");
  });

  it("shows 未设定 for requirement when none", () => {
    const card = renderWorkbenchCard(emptyState());
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("未设定");
  });

  it("shows requirement doc link when present", () => {
    const card = renderWorkbenchCard(emptyState({
      requirementText: "req",
      requirementDocUrl: "https://example.com/req",
    }));
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("https://example.com/req");
  });

  it("shows ─ for plan when none", () => {
    const card = renderWorkbenchCard(emptyState());
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("─");
  });

  it("shows plan doc link when present", () => {
    const card = renderWorkbenchCard(emptyState({
      planText: "plan",
      planDocUrl: "https://example.com/plan",
    }));
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("https://example.com/plan");
  });

  it("shows ⚠️ warning when planStale is true", () => {
    const card = renderWorkbenchCard(emptyState({
      requirementText: "req",
      planText: "plan",
      planStale: true,
    }));
    const md = getMarkdowns(card).join("\n");
    expect(md).toContain("⚠️");
  });

  it("does not show ⚠️ warning when planStale is false", () => {
    const card = renderWorkbenchCard(emptyState({
      requirementText: "req",
      planText: "plan",
      planStale: false,
    }));
    const md = getMarkdowns(card).join("\n");
    expect(md).not.toContain("⚠️");
  });

  describe("button visibility", () => {
    it("shows only manage_repos in empty state", () => {
      const actions = buttonActions(renderWorkbenchCard(emptyState()));
      expect(actions).toContain("workbench_manage_repos");
      expect(actions).not.toContain("workbench_discuss_requirement");
      expect(actions).not.toContain("workbench_revise_requirement");
      expect(actions).not.toContain("workbench_generate_plan");
      expect(actions).not.toContain("workbench_revise_plan");
      expect(actions).not.toContain("workbench_delete_requirement");
      expect(actions).not.toContain("workbench_delete_plan");
    });

    it("shows discuss_requirement when repos exist", () => {
      const actions = buttonActions(renderWorkbenchCard(emptyState({
        repositories: ["repo1"],
      })));
      expect(actions).toContain("workbench_manage_repos");
      expect(actions).toContain("workbench_discuss_requirement");
      expect(actions).not.toContain("workbench_revise_requirement");
      expect(actions).not.toContain("workbench_generate_plan");
    });

    it("shows revise/generate buttons when requirement exists", () => {
      const actions = buttonActions(renderWorkbenchCard(emptyState({
        repositories: ["repo1"],
        requirementText: "req text",
      })));
      expect(actions).toContain("workbench_discuss_requirement");
      expect(actions).toContain("workbench_revise_requirement");
      expect(actions).toContain("workbench_generate_plan");
      expect(actions).not.toContain("workbench_revise_plan");
      expect(actions).toContain("workbench_delete_requirement");
    });

    it("shows plan buttons when plan exists", () => {
      const actions = buttonActions(renderWorkbenchCard(emptyState({
        repositories: ["repo1"],
        requirementText: "req",
        planText: "plan",
      })));
      expect(actions).toContain("workbench_revise_plan");
      expect(actions).toContain("workbench_delete_plan");
      expect(actions).not.toContain("workbench_generate_plan");
    });

    it("hides revision/deletion when no requirement or plan", () => {
      const actions = buttonActions(renderWorkbenchCard(emptyState({
        repositories: ["repo1"],
      })));
      expect(actions).not.toContain("workbench_revise_requirement");
      expect(actions).not.toContain("workbench_generate_plan");
      expect(actions).not.toContain("workbench_revise_plan");
      expect(actions).not.toContain("workbench_delete_requirement");
      expect(actions).not.toContain("workbench_delete_plan");
    });
  });

  describe("button actions", () => {
    it("all button actions follow workbench_<name> format", () => {
      const actions = buttonActions(renderWorkbenchCard(emptyState({
        repositories: ["r1"],
        requirementText: "req",
        requirementDocUrl: "https://example.com",
        planText: "plan",
        planDocUrl: "https://example.com",
      })));
      for (const action of actions) {
        expect(action).toMatch(/^workbench_[a-z_]+$/);
      }
    });
  });
});
