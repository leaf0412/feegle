import { describe, expect, it } from "vitest";
import { parseGitLabIssueUrl } from "../../src/gitlab/gitlab-url-parser.js";

describe("parseGitLabIssueUrl", () => {
  it("parses a standard GitLab issue URL with nested namespace", () => {
    const result = parseGitLabIssueUrl("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14");
    expect(result).toEqual({
      host: "www.lejuhub.com",
      namespace: "pc",
      project: "kuavo-tools",
      issueIid: 14
    });
  });

  it("parses a URL with flat namespace (no subgroup)", () => {
    const result = parseGitLabIssueUrl("https://gitlab.com/myproject/-/issues/42");
    expect(result).toEqual({
      host: "gitlab.com",
      namespace: "",
      project: "myproject",
      issueIid: 42
    });
  });

  it("parses a URL with deeply nested namespace", () => {
    const result = parseGitLabIssueUrl("https://www.lejuhub.com/a/b/c/proj/-/issues/99");
    expect(result).toEqual({
      host: "www.lejuhub.com",
      namespace: "a/b/c",
      project: "proj",
      issueIid: 99
    });
  });

  it("throws for non-issue URLs", () => {
    expect(() => parseGitLabIssueUrl("https://gitlab.com/proj")).toThrow(/not a GitLab issue URL/);
    expect(() => parseGitLabIssueUrl("https://gitlab.com/proj/-/merge_requests/1")).toThrow(/not a GitLab issue URL/);
  });

  it("throws for URLs without issue IID", () => {
    expect(() => parseGitLabIssueUrl("https://gitlab.com/proj/-/issues/abc")).toThrow(/invalid issue IID/);
  });

  it("handles trailing slashes and fragments", () => {
    const result = parseGitLabIssueUrl("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14/");
    expect(result.issueIid).toBe(14);

    const withHash = parseGitLabIssueUrl("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14#note_123");
    expect(withHash.issueIid).toBe(14);
  });
});
