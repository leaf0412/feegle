import { describe, expect, it } from "vitest";
import {
  assertValidFeishuWorkbenchCard,
  buildDirectorySavedCard,
  buildDirectorySetupCard,
  buildPlanReviewCard,
  buildPlanRevisionRequestCard
} from "../../src/feishu/feishu-workbench-cards.js";

describe("buildDirectorySetupCard", () => {
  it("renders a directory setup form with workspace select and manual path input", () => {
    const card = buildDirectorySetupCard({
      interactionId: "pi_1",
      providers: ["codex", "claude"],
      workspaces: [{ label: "feegle", path: "/repo/feegle" }]
    });

    const json = JSON.stringify(card);

    expect(json).toContain("form");
    expect(json).toContain("input");
    expect(json).toContain("select_static");
    expect(json).toContain("act:/workbench directory submit");
    expect(json).toContain("provider");
    expect(json).toContain("workspace_path");
    expect(json).toContain("manual_path");
    expect(formContainers(card).some((form) => hasOwnProperty(form, "submit"))).toBe(false);
    expect(formElements(card).some((element) => hasOwnProperty(element, "label"))).toBe(false);
    expect(formElements(card)).toContainEqual(
      expect.objectContaining({
        tag: "button",
        action_type: "form_submit",
        name: "submit_directory",
        value: expect.objectContaining({
          action: "act:/workbench directory submit",
          interaction_id: "pi_1"
        })
      })
    );
    expect(() => assertValidFeishuWorkbenchCard(card)).not.toThrow();
  });

  it("renders a compact plan review card with approval actions", () => {
    const card = buildPlanReviewCard({
      planId: "plan_1",
      title: "Fix startup",
      version: 1,
      summary: { steps: 2, risks: ["unknown env"] }
    });

    const json = JSON.stringify(card);

    expect(json).toContain("Fix startup");
    expect(json).toContain("unknown env");
    expect(json).toContain("act:/workbench plan approve");
    expect(json).toContain("act:/workbench plan revise");
    expect(json).toContain("act:/workbench plan cancel");
    expect(json).toContain("\"plan_id\":\"plan_1\"");
    expect(json).toContain("\"version\":\"1\"");
    expect(() => assertValidFeishuWorkbenchCard(card)).not.toThrow();
  });

  it("renders a multiline plan revision request form", () => {
    const card = buildPlanRevisionRequestCard({ planId: "plan_1", version: 1 });

    const json = JSON.stringify(card);

    expect(json).toContain("form");
    expect(json).toContain("input");
    expect(json).toContain("revision_note");
    expect(json).toContain("multiline");
    expect(json).toContain("act:/workbench plan revise submit");
    expect(formContainers(card).some((form) => hasOwnProperty(form, "submit"))).toBe(false);
    expect(formElements(card).some((element) => hasOwnProperty(element, "label"))).toBe(false);
    expect(formElements(card)).toContainEqual(
      expect.objectContaining({
        tag: "button",
        action_type: "form_submit",
        name: "submit_revision",
        value: expect.objectContaining({
          action: "act:/workbench plan revise submit",
          plan_id: "plan_1",
          version: "1"
        })
      })
    );
    expect(() => assertValidFeishuWorkbenchCard(card)).not.toThrow();
  });

  it("rejects known Feishu card fields that fail only at send time", () => {
    const invalidCard = buildDirectorySetupCard({
      interactionId: "pi_1",
      providers: ["codex"],
      workspaces: [{ label: "feegle", path: "/repo/feegle" }]
    }) as unknown as Record<string, unknown>;
    const forms = formContainers(invalidCard);
    forms[0].submit = { tag: "button" };
    formElements(invalidCard)[0].label = { tag: "plain_text", content: "Agent" };

    expect(() => assertValidFeishuWorkbenchCard(invalidCard)).toThrow(
      "Invalid Feishu workbench card: form elements must not include label; form must not include submit"
    );
  });

  it("renders a read-only saved directory card after the setup form is submitted", () => {
    const card = buildDirectorySavedCard({
      provider: "codex",
      workspacePath: "/repo/feegle"
    });

    const json = JSON.stringify(card);

    expect(json).toContain("已保存工作目录");
    expect(json).toContain("/repo/feegle");
    expect(json).toContain("codex");
    expect(json).not.toContain("form_submit");
    expect(json).not.toContain("select_static");
    expect(() => assertValidFeishuWorkbenchCard(card)).not.toThrow();
  });
});

function formContainers(card: unknown): Array<Record<string, unknown>> {
  if (!isRecord(card) || !isRecord(card.body) || !Array.isArray(card.body.elements)) {
    return [];
  }
  return card.body.elements.filter(isRecord).filter((element) => element.tag === "form");
}

function formElements(card: unknown): Array<Record<string, unknown>> {
  return formContainers(card)
    .flatMap((form) => (Array.isArray(form.elements) ? form.elements.filter(isRecord) : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnProperty(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
