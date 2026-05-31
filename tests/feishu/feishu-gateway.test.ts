import { describe, expect, it } from "vitest";
import { parseFeishuCardActionValue, parseFeishuCommand } from "@integrations/feishu/feishu-gateway.js";

describe("parseFeishuCommand", () => {
  it("parses repo selection with multiple repository ids", () => {
    expect(parseFeishuCommand("/repo select repo_1 repo_2")).toEqual({
      type: "repo_select",
      repositoryIds: ["repo_1", "repo_2"]
    });
  });

  it("trims whitespace before detecting repo selection", () => {
    expect(parseFeishuCommand("  /repo   select   repo_1   repo_2  ")).toEqual({
      type: "repo_select",
      repositoryIds: ["repo_1", "repo_2"]
    });
  });

  it("ignores leading Feishu mention text before commands", () => {
    expect(parseFeishuCommand("@_user_1 /repo select web api")).toEqual({
      type: "repo_select",
      repositoryIds: ["web", "api"]
    });
  });

  it("parses push card actions per repository", () => {
    expect(parseFeishuCommand("card:push:req_1:repo_1")).toEqual({
      type: "push_repository",
      requirementId: "req_1",
      repositoryId: "repo_1"
    });
  });

  it("parses help commands with optional groups", () => {
    expect(parseFeishuCommand("/help repo")).toEqual({
      type: "help",
      groupKey: "repo"
    });
  });

  it("passes slash input to the command responder for registry-owned lookup", () => {
    expect(parseFeishuCommand("/repo list")).toEqual({
      type: "slash_input",
      raw: "/repo list"
    });
  });

  it("returns chat for non-slash text while preserving raw text", () => {
    expect(parseFeishuCommand("hello")).toEqual({
      type: "chat",
      raw: "hello"
    });
  });

  it("preserves malformed slash input for registry-owned lookup", () => {
    const raw = "  /repo select  ";

    expect(parseFeishuCommand(raw)).toEqual({
      type: "slash_input",
      raw: "/repo select"
    });
  });

  it("does not throw on malformed card actions", () => {
    const raw = "card:push:req_1:";

    expect(parseFeishuCommand(raw)).toEqual({
      type: "unknown",
      raw
    });
  });

  it("does not throw on unsupported card action values", () => {
    expect(parseFeishuCardActionValue(undefined)).toEqual({ type: "unknown", raw: "undefined" });
    expect(parseFeishuCardActionValue(1n)).toEqual({ type: "unknown", raw: "1" });
  });

  it("parses platform action card values", () => {
    expect(parseFeishuCardActionValue({ action: "act:/push repo web" })).toEqual({
      type: "platform_action",
      action: {
        kind: "act",
        command: "/push",
        args: "repo web",
        raw: "act:/push repo web"
      },
      sessionKey: undefined
    });
  });

  it("preserves session key from card values", () => {
    expect(
      parseFeishuCardActionValue({
        action: "nav:/status req_1",
        session_key: "feishu:oc_1:channel"
      })
    ).toEqual({
      type: "platform_action",
      action: {
        kind: "nav",
        command: "/status",
        args: "req_1",
        raw: "nav:/status req_1"
      },
      sessionKey: "feishu:oc_1:channel"
    });
  });

  it("treats a retired workbench directory submit click as a generic act: action", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench directory submit",
        interaction_id: "pi_1",
        form_value: {
          provider: "codex",
          workspace_path: "/repo/shortcut",
          manual_path: "/repo/manual"
        }
      })
    ).toEqual({
      type: "platform_action",
      action: {
        kind: "act",
        command: "/workbench",
        args: "directory submit",
        raw: "act:/workbench directory submit"
      },
      sessionKey: undefined
    });
  });

  it("parses workbench plan revision submissions", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan revise submit",
        plan_id: "plan_1",
        version: "2",
        form_value: {
          revision_note: "Add Playwright verification\nCall out deployment risk"
        }
      })
    ).toEqual({
      type: "workbench_plan_revision_submit",
      planId: "plan_1",
      version: 2,
      revisionNote: "Add Playwright verification\nCall out deployment risk"
    });
  });

  it("parses a bind-repo card submit: url from form_value + embedded scope", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/repo bind_submit",
        scope_key: "oc_g",
        scope_noun: "本群",
        form_value: { repo_url: "  git@github.com:org/repo.git  " }
      })
    ).toEqual({
      type: "bind_repo_submit",
      url: "git@github.com:org/repo.git",
      scopeKey: "oc_g",
      scopeNoun: "本群"
    });
  });

  it("treats a bind-repo submit with an empty url as unknown", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/repo bind_submit",
        scope_key: "oc_g",
        scope_noun: "本群",
        form_value: { repo_url: "   " }
      })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("treats a bind-repo submit with no scope_key as unknown", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/repo bind_submit",
        form_value: { repo_url: "git@github.com:org/repo.git" }
      })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("parses a bind-repo cancel with its scope (ignoring the carried form input)", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/repo bind_cancel",
        scope_key: "oc_g",
        form_value: { repo_url: "" }
      })
    ).toEqual({ type: "bind_repo_cancel", scopeKey: "oc_g" });
  });

  it("treats a bind-repo cancel with no scope_key as unknown", () => {
    expect(parseFeishuCardActionValue({ action: "act:/repo bind_cancel" })).toEqual({
      type: "unknown",
      raw: expect.any(String)
    });
  });

  it("parses workbench plan revise requests", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan revise",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({
      type: "workbench_plan_revise",
      planId: "plan_1",
      version: 1
    });
  });

  it("parses approve action", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan approve",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({ type: "workbench_plan_approve", planId: "plan_1", version: 1 });
  });

  it("parses cancel action (review-stage)", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan cancel",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({ type: "workbench_plan_cancel", planId: "plan_1", version: 1 });
  });

  it("parses reject action (completed-stage)", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan reject",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({ type: "workbench_plan_reject", planId: "plan_1", version: 1 });
  });

  it("parses push / cleanup actions", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan push",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({ type: "workbench_plan_push", planId: "plan_1", version: 1 });
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan cleanup",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({ type: "workbench_plan_cleanup", planId: "plan_1", version: 1 });
  });

  it("parses base_branch_submit with manual override + head_branch", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan base_branch_submit",
        plan_id: "plan_1",
        version: "1",
        form_value: { base_branch: "main", base_branch_manual: "  ", head_branch: "yb/feat/x" }
      })
    ).toEqual({
      type: "workbench_plan_base_branch_submit",
      planId: "plan_1",
      version: 1,
      baseBranch: "main",
      headBranch: "yb/feat/x"
    });
  });

  it("base_branch_submit prefers manual input over select", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan base_branch_submit",
        plan_id: "plan_1",
        version: "1",
        form_value: { base_branch: "main", base_branch_manual: "develop" }
      })
    ).toEqual({
      type: "workbench_plan_base_branch_submit",
      planId: "plan_1",
      version: 1,
      baseBranch: "develop"
    });
  });

  it("parses revise_execution + revise_execution_submit", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan revise_execution",
        plan_id: "plan_1",
        version: "1"
      })
    ).toEqual({ type: "workbench_plan_revise_execution", planId: "plan_1", version: 1 });
    expect(
      parseFeishuCardActionValue({
        action: "act:/workbench plan revise_execution_submit",
        plan_id: "plan_1",
        version: "1",
        form_value: { revision_note: "增加错误处理\n第二行" }
      })
    ).toEqual({
      type: "workbench_plan_revise_execution_submit",
      planId: "plan_1",
      version: 1,
      note: "增加错误处理\n第二行"
    });
  });

  it("parses requirement plan approve with requirementId and planVersion", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan approve",
        requirement_id: "reqwf_1",
        plan_version: "1"
      })
    ).toEqual({ type: "requirement_plan_approve", requirementId: "reqwf_1", planVersion: 1 });
  });

  it("carries doc_url on approve so 回退 can re-link the cloud doc", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan approve",
        requirement_id: "reqwf_1",
        plan_version: "1",
        doc_url: "https://feishu.cn/docx/doc_1"
      })
    ).toEqual({
      type: "requirement_plan_approve",
      requirementId: "reqwf_1",
      planVersion: 1,
      docUrl: "https://feishu.cn/docx/doc_1"
    });
  });

  it("parses requirement plan back (回退到计划) with doc_url", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan back",
        requirement_id: "reqwf_1",
        plan_version: "2",
        doc_url: "https://feishu.cn/docx/doc_1"
      })
    ).toEqual({
      type: "requirement_plan_back",
      requirementId: "reqwf_1",
      planVersion: 2,
      docUrl: "https://feishu.cn/docx/doc_1"
    });
  });

  it("treats requirement plan back with missing requirement_id as unknown", () => {
    expect(
      parseFeishuCardActionValue({ action: "act:/requirement plan back", plan_version: "1" })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("treats requirement plan approve with missing requirement_id as unknown", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan approve",
        plan_version: "1"
      })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("treats requirement plan approve with invalid plan_version as unknown", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan approve",
        requirement_id: "reqwf_1",
        plan_version: "0"
      })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("parses requirement plan cancel with requirementId", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan cancel",
        requirement_id: "reqwf_1"
      })
    ).toEqual({ type: "requirement_cancel", requirementId: "reqwf_1" });
  });

  it("treats requirement plan cancel with missing requirement_id as unknown", () => {
    expect(
      parseFeishuCardActionValue({ action: "act:/requirement plan cancel" })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("parses requirement plan revise submit with feedback from form_value", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan revise submit",
        requirement_id: "reqwf_1",
        plan_version: "2",
        form_value: { revision_note: "补充验收标准\n拆解步骤" }
      })
    ).toEqual({
      type: "requirement_plan_revise",
      requirementId: "reqwf_1",
      planVersion: 2,
      feedback: "补充验收标准\n拆解步骤"
    });
  });

  it("parses requirement plan revise submit with feedback directly in value", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan revise submit",
        requirement_id: "reqwf_1",
        plan_version: "1",
        revision_note: "增加部署风险说明"
      })
    ).toEqual({
      type: "requirement_plan_revise",
      requirementId: "reqwf_1",
      planVersion: 1,
      feedback: "增加部署风险说明"
    });
  });

  it("treats requirement plan revise submit with empty feedback as unknown", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan revise submit",
        requirement_id: "reqwf_1",
        plan_version: "1",
        form_value: { revision_note: "" }
      })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("treats requirement plan revise submit with missing requirement_id as unknown", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement plan revise submit",
        plan_version: "1",
        form_value: { revision_note: "some feedback" }
      })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("no longer maps act:/requirement execute to a requirement_execute command (approve now develops directly)", () => {
    const parsed = parseFeishuCardActionValue({
      action: "act:/requirement execute",
      requirement_id: "reqwf_1",
      plan_version: "2"
    });
    // the dedicated execute command is gone; it falls through to the generic
    // platform_action parser and must never be a requirement_execute again.
    expect(parsed.type).not.toBe("requirement_execute");
  });

  it("parses requirement verify with requirementId", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement verify",
        requirement_id: "reqwf_1"
      })
    ).toEqual({ type: "requirement_verify", requirementId: "reqwf_1" });
  });

  it("treats requirement verify with missing requirement_id as unknown", () => {
    expect(
      parseFeishuCardActionValue({ action: "act:/requirement verify" })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });

  it("parses requirement accept with requirementId", () => {
    expect(
      parseFeishuCardActionValue({
        action: "act:/requirement accept",
        requirement_id: "reqwf_1"
      })
    ).toEqual({ type: "requirement_accept", requirementId: "reqwf_1" });
  });

  it("treats requirement accept with missing requirement_id as unknown", () => {
    expect(
      parseFeishuCardActionValue({ action: "act:/requirement accept" })
    ).toEqual({ type: "unknown", raw: expect.any(String) });
  });
});
