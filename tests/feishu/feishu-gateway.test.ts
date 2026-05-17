import { describe, expect, it } from "vitest";
import { parseFeishuCommand } from "../../src/feishu/feishu-gateway.js";

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

  it("parses push card actions per repository", () => {
    expect(parseFeishuCommand("card:push:req_1:repo_1")).toEqual({
      type: "push_repository",
      requirementId: "req_1",
      repositoryId: "repo_1"
    });
  });

  it("returns unknown for malformed commands while preserving raw text", () => {
    const raw = "  /repo select  ";

    expect(parseFeishuCommand(raw)).toEqual({
      type: "unknown",
      raw
    });
  });

  it("does not throw on malformed card actions", () => {
    const raw = "card:push:req_1:";

    expect(parseFeishuCommand(raw)).toEqual({
      type: "unknown",
      raw
    });
  });
});
