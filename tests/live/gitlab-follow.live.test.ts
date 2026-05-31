import { describe, expect, it } from "vitest";
import { GitLabClient } from "@integrations/gitlab/gitlab-client.js";
import { parseGitLabIssueUrl } from "@integrations/gitlab/gitlab-url-parser.js";

// Read-only smoke test against a real GitLab (lejuhub by default). Gated off by default.
// Run with:
//   RUN_LIVE_GITLAB_TEST=1 LIVE_GITLAB_BOT=<bot-username> \
//   LIVE_GITLAB_ISSUE_URL=<https://.../-/issues/N> npx vitest run tests/live/gitlab-follow.live.test.ts
// Requires GITLAB_TOKEN in the environment. Never posts comments — verification only.
describe.skipIf(process.env.RUN_LIVE_GITLAB_TEST !== "1")("GitLab follow live (read-only)", () => {
  const token = process.env["GITLAB_TOKEN"];
  const host = process.env["LIVE_GITLAB_HOST"] ?? "www.lejuhub.com";
  const client = new GitLabClient(token ?? "");

  it("searchMentionedIssues authenticates and returns only opened issues", async () => {
    const bot = process.env.LIVE_GITLAB_BOT;
    expect(bot, "set LIVE_GITLAB_BOT to the bot username").toBeTruthy();

    const issues = await client.searchMentionedIssues(bot!, host);
    expect(Array.isArray(issues)).toBe(true);
    for (const issue of issues) {
      expect(issue.state).toBe("opened");
      expect(typeof issue.iid).toBe("number");
      expect(typeof issue.web_url).toBe("string");
    }
    // surface the count without dumping issue bodies (may contain anything)
    console.log(`[live] found ${issues.length} open issue(s) mentioning @${bot}`);
  });

  it.skipIf(!process.env.LIVE_GITLAB_ISSUE_URL)(
    "getIssue and getNotes parse a real issue",
    async () => {
      const url = parseGitLabIssueUrl(process.env.LIVE_GITLAB_ISSUE_URL!);

      const issue = await client.getIssue(url);
      expect(issue.iid).toBe(url.issueIid);
      expect(typeof issue.title).toBe("string");
      expect(["opened", "closed"]).toContain(issue.state);

      const notes = await client.getNotes(url);
      expect(Array.isArray(notes)).toBe(true);
      // getNotes must strip system notes — the kind's reply detection relies on it
      expect(notes.every((n) => n.system === false)).toBe(true);
      console.log(`[live] issue #${issue.iid} has ${notes.length} non-system note(s)`);
    }
  );
});
