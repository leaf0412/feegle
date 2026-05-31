import { describe, expect, it } from "vitest";
import {
  assertValidFeishuWorkbenchCard,
  buildBaseBranchPromptCard,
  buildBindRepoPromptCard,
  buildPlanCompletedCard,
  buildPlanExecutionRevisionCard,
  buildPlanProgressCard,
  buildPlanPushResultCard,
  buildPlanReviewCard,
  buildPlanRevisionRequestCard,
  buildRepoBoundCard,
  buildRepoBindCancelledCard,
  buildBindPromptSupersededCard
} from "../../src/integrations/feishu/feishu-workbench-cards.js";

describe("workbench cards", () => {
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

  it("renders a URL button opening the cloud doc when docUrl is provided", () => {
    const card = buildPlanReviewCard({
      planId: "plan_1",
      title: "Fix startup",
      version: 1,
      summary: { steps: 3, risks: [] },
      docUrl: "https://feishu.cn/docx/doxcn_xyz"
    });

    const json = JSON.stringify(card);
    expect(json).toContain("打开云文档");
    expect(json).toContain("https://feishu.cn/docx/doxcn_xyz");
    const docButtonIdx = json.indexOf("打开云文档");
    const approveButtonIdx = json.indexOf("确认计划");
    expect(docButtonIdx).toBeGreaterThan(-1);
    expect(approveButtonIdx).toBeGreaterThan(docButtonIdx);
  });

  it("omits the doc button when docUrl is not provided", () => {
    const card = buildPlanReviewCard({
      planId: "plan_1",
      title: "Fix startup",
      version: 1,
      summary: { steps: 3, risks: [] }
    });

    expect(JSON.stringify(card)).not.toContain("打开云文档");
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
    const invalidCard = buildPlanRevisionRequestCard({
      planId: "plan_1",
      version: 1
    }) as unknown as Record<string, unknown>;
    const forms = formContainers(invalidCard);
    forms[0].submit = { tag: "button" };
    formElements(invalidCard)[0].label = { tag: "plain_text", content: "Note" };

    expect(() => assertValidFeishuWorkbenchCard(invalidCard)).toThrow(
      "Invalid Feishu workbench card: form elements must not include label; form must not include submit"
    );
  });

  it("builds a base branch prompt card with remote candidates", () => {
    const card = buildBaseBranchPromptCard({
      planId: "plan_1",
      version: 1,
      title: "Fix startup",
      defaultHeadBranch: "yb/feat/fix_startup",
      candidates: ["main", "beta", "feature/auth"]
    });
    const json = JSON.stringify(card);

    expect(json).toContain("act:/workbench plan base_branch_submit");
    expect(json).toContain("plan_1");
    expect(json).toContain("yb/feat/fix_startup");
    expect(json).toContain("main");
    expect(json).toContain("beta");
    expect(json).toContain("feature/auth");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds a plan progress card with stage and recent events", () => {
    const card = buildPlanProgressCard({
      planId: "plan_1",
      version: 1,
      title: "Fix startup",
      headBranch: "yb/feat/fix_startup",
      iteration: 2,
      stage: "executing",
      recentEvents: ["reading src/app/feegle-app.ts", "editing tests/git/git-service.test.ts"]
    });
    const json = JSON.stringify(card);

    expect(json).toContain("Fix startup");
    expect(json).toContain("yb/feat/fix_startup");
    expect(json).toContain("迭代 2");
    expect(json).toContain("executing");
    expect(json).toContain("reading src/app/feegle-app.ts");
    expect(card.body.elements.some((el) => el.tag === "action")).toBe(false);
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds a plan completed card with branch / commit / files / worktree + 4 action buttons", () => {
    const card = buildPlanCompletedCard({
      planId: "plan_1",
      version: 1,
      title: "Fix startup",
      headBranch: "yb/feat/fix_startup",
      worktreePath: "/Users/yb/.feegle/worktrees/feegle/plan_1",
      iteration: 2,
      commitCount: 3,
      filesChanged: 7,
      iterationNotes: [
        { iteration: 1, note: null },
        { iteration: 2, note: "增加错误处理" }
      ]
    });
    const json = JSON.stringify(card);

    expect(json).toContain("yb/feat/fix_startup");
    expect(json).toContain("3");
    expect(json).toContain("7");
    expect(json).toContain("/Users/yb/.feegle/worktrees/feegle/plan_1");
    expect(json).toContain("增加错误处理");
    expect(json).toContain("act:/workbench plan revise_execution");
    expect(json).toContain("act:/workbench plan push");
    expect(json).toContain("act:/workbench plan reject");
    expect(json).toContain("act:/workbench plan cleanup");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds an execution revision request card", () => {
    const card = buildPlanExecutionRevisionCard({ planId: "plan_1", version: 1, iteration: 2 });
    const json = JSON.stringify(card);

    expect(json).toContain("act:/workbench plan revise_execution_submit");
    expect(json).toContain("plan_1");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds a green push success card with cleanup button", () => {
    const card = buildPlanPushResultCard({
      planId: "plan_1",
      version: 1,
      title: "Fix startup",
      headBranch: "yb/feat/fix_startup",
      success: true
    });
    const json = JSON.stringify(card);

    expect(card.header.template).toBe("green");
    expect(json).toContain("已推送");
    expect(json).toContain("act:/workbench plan cleanup");
    expect(json).not.toContain("act:/workbench plan push");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds a bind-repo prompt card: url input + submit carrying the embedded scope", () => {
    const card = buildBindRepoPromptCard({ scopeKey: "oc_g", scopeNoun: "本群" });
    const json = JSON.stringify(card);

    expect(json).toContain("绑定仓库");
    expect(json).toContain("repo_url");
    expect(json).toContain("input");
    // The scope is baked into the submit value so the bind lands where the
    // prompt appeared — card callbacks do not carry chat_type to re-derive it.
    expect(formElements(card)).toContainEqual(
      expect.objectContaining({
        tag: "button",
        action_type: "form_submit",
        value: expect.objectContaining({
          action: "act:/repo bind_submit",
          scope_key: "oc_g",
          scope_noun: "本群"
        })
      })
    );
    expect(formContainers(card).some((form) => hasOwnProperty(form, "submit"))).toBe(false);
    expect(formElements(card).some((element) => hasOwnProperty(element, "label"))).toBe(false);
    expect(() => assertValidFeishuWorkbenchCard(card)).not.toThrow();
  });

  it("offers a cancel button as a second form-submit (schema 2.0 has no action block)", () => {
    const card = buildBindRepoPromptCard({ scopeKey: "oc_g", scopeNoun: "本群" });

    // schema 2.0 rejects `tag: action`; cancel must live inside the form
    expect(card.body.elements.some((el) => el.tag === "action")).toBe(false);
    expect(formElements(card)).toContainEqual(
      expect.objectContaining({
        tag: "button",
        action_type: "form_submit",
        name: "cancel_bind_repo",
        value: expect.objectContaining({
          action: "act:/repo bind_cancel",
          scope_key: "oc_g"
        })
      })
    );
    expect(() => assertValidFeishuWorkbenchCard(card)).not.toThrow();
  });

  it("builds a grey repo-bind cancelled card", () => {
    const card = buildRepoBindCancelledCard();
    const json = JSON.stringify(card);

    expect(json).toContain("已取消");
    // no leftover input / submit — the card is inert after cancel
    expect(json).not.toContain("repo_url");
    expect(json).not.toContain("form_submit");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds an inert superseded card for swept-away duplicate prompts", () => {
    const card = buildBindPromptSupersededCard();
    const json = JSON.stringify(card);

    expect(json).toContain("已失效");
    expect(json).not.toContain("repo_url");
    expect(json).not.toContain("form_submit");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds a green repo-bound confirmation card", () => {
    const card = buildRepoBoundCard({
      scopeNoun: "本群",
      repoName: "kuavo",
      repoId: "3",
      boundLines: "    - kuavo (3)"
    });
    const json = JSON.stringify(card);

    expect(card.header.template).toBe("green");
    expect(json).toContain("已为本群绑定仓库");
    expect(json).toContain("kuavo (3)");
    expect(json).toContain("现在可以直接发消息");
    assertValidFeishuWorkbenchCard(card);
  });

  it("builds a red push failure card with retry button and stderr", () => {
    const card = buildPlanPushResultCard({
      planId: "plan_1",
      version: 1,
      title: "Fix startup",
      headBranch: "yb/feat/fix_startup",
      success: false,
      stderr: "remote: error: hook declined\n"
    });
    const json = JSON.stringify(card);

    expect(card.header.template).toBe("red");
    expect(json).toContain("hook declined");
    expect(json).toContain("act:/workbench plan push");
    expect(json).toContain("act:/workbench plan revise_execution");
    assertValidFeishuWorkbenchCard(card);
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
