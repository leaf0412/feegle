import { describe, expect, it } from "vitest";
import { parseFeishuCardActionValue, parseFeishuCommand } from "../../src/feishu/feishu-gateway.js";

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

  it("parses workbench directory setup form submissions", () => {
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
      type: "workbench_directory_submit",
      interactionId: "pi_1",
      provider: "codex",
      workspacePath: "/repo/shortcut",
      manualPath: "/repo/manual"
    });
  });
});
