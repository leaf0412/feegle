import type { GitLabIssueUrl } from "./gitlab-types.js";

const ISSUE_URL_PATTERN = /^https?:\/\/([^/]+)\/(.+)\/-\/issues\/([^/\s#]+)\/?/;

export function parseGitLabIssueUrl(raw: string): GitLabIssueUrl {
  const trimmed = raw.trim();
  const match = trimmed.match(ISSUE_URL_PATTERN);

  if (!match) {
    throw new Error(`not a GitLab issue URL: ${trimmed}`);
  }

  const host = match[1]!;
  const fullPath = match[2]!;
  const issueIid = parseInt(match[3]!, 10);

  if (isNaN(issueIid)) {
    throw new Error(`invalid issue IID in URL: ${trimmed}`);
  }

  const segments = fullPath.split("/");
  const project = segments.pop()!;
  const namespace = segments.join("/");

  return { host, namespace, project, issueIid };
}
