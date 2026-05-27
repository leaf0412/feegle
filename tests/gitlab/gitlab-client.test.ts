import { describe, expect, it, vi } from "vitest";
import { GitLabClient } from "../../src/gitlab/gitlab-client.js";
import type { GitLabIssueUrl } from "../../src/gitlab/gitlab-types.js";

const issueUrl: GitLabIssueUrl = {
  host: "www.lejuhub.com",
  namespace: "pc",
  project: "kuavo-tools",
  issueIid: 14
};

function createFetchMock(responseOverrides: Record<string, unknown> = {}) {
  const mock = vi.fn();
  const defaultIssue = {
    id: 100,
    iid: 14,
    title: "Test Issue",
    description: "description text",
    state: "opened",
    created_at: "2026-05-21T02:21:00Z",
    updated_at: "2026-05-21T02:21:00Z",
    assignee: { id: 1, username: "yebao", name: "叶宝" },
    due_date: "2026-05-22",
    labels: ["P0"],
    web_url: "https://www.lejuhub.com/pc/kuavo-tools/-/issues/14",
    references: { full: "pc/kuavo-tools#14" },
    ...responseOverrides
  };
  mock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => defaultIssue
  });
  return mock;
}

describe("GitLabClient", () => {
  it("constructs the correct API URL for fetching an issue", async () => {
    const fetchMock = createFetchMock();
    const client = new GitLabClient("glpat-token", fetchMock);

    await client.getIssue(issueUrl);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.lejuhub.com/api/v4/projects/pc%2Fkuavo-tools/issues/14",
      expect.objectContaining({
        headers: expect.objectContaining({
          "PRIVATE-TOKEN": "glpat-token"
        })
      })
    );
  });

  it("returns parsed issue data", async () => {
    const client = new GitLabClient("glpat-token", createFetchMock());

    const issue = await client.getIssue(issueUrl);

    expect(issue.title).toBe("Test Issue");
    expect(issue.state).toBe("opened");
    expect(issue.assignee?.username).toBe("yebao");
  });

  it("constructs the correct API URL for fetching notes", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 1, body: "comment 1", created_at: "2026-05-21T02:22:00Z", system: false, author: { id: 1, username: "yebao", name: "叶宝" } }
      ]
    });
    const client = new GitLabClient("glpat-token", fetchMock);

    await client.getNotes(issueUrl);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.lejuhub.com/api/v4/projects/pc%2Fkuavo-tools/issues/14/notes?sort=asc&per_page=100",
      expect.objectContaining({
        headers: expect.objectContaining({ "PRIVATE-TOKEN": "glpat-token" })
      })
    );
  });

  it("filters out system notes", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 1, body: "real comment", created_at: "2026-05-21T02:22:00Z", system: false, author: { id: 1, username: "yebao", name: "叶宝" } },
        { id: 2, body: "changed due date", created_at: "2026-05-21T02:21:00Z", system: true, author: { id: 1, username: "yebao", name: "叶宝" } }
      ]
    });
    const client = new GitLabClient("glpat-token", fetchMock);

    const notes = await client.getNotes(issueUrl);

    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toBe("real comment");
  });

  it("posts a comment to the issue", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });
    const client = new GitLabClient("glpat-token", fetchMock);

    await client.postNote(issueUrl, "## Summary\n...");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.lejuhub.com/api/v4/projects/pc%2Fkuavo-tools/issues/14/notes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "PRIVATE-TOKEN": "glpat-token",
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({ body: "## Summary\n..." })
      })
    );
  });

  it("uses the explicitly passed host for mention search (no env / hardcoded default)", async () => {
    const calls: string[] = [];
    const fetchMock = (async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    const client = new GitLabClient("glpat-token", fetchMock);
    await client.searchMentionedIssues("bot", "git.example.com");
    expect(calls[0]).toContain("https://git.example.com/api/v4/search");
  });

  it("throws on non-2xx response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ message: "Not Found" })
    });
    const client = new GitLabClient("glpat-token", fetchMock);

    await expect(client.getIssue(issueUrl)).rejects.toThrow(/GitLab API error 404/);
  });
});
