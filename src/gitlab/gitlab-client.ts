import type { GitLabIssue, GitLabIssueUrl, GitLabNote } from "./gitlab-types.js";

export class GitLabClient {
  private readonly baseUrl: (host: string) => string;

  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {
    this.baseUrl = (host: string) => `https://${host}/api/v4`;
  }

  async getIssue(url: GitLabIssueUrl): Promise<GitLabIssue> {
    const projectPath = this.encodeProjectPath(url);
    const apiUrl = `${this.baseUrl(url.host)}/projects/${projectPath}/issues/${url.issueIid}`;
    return this.request<GitLabIssue>(apiUrl);
  }

  async getNotes(url: GitLabIssueUrl): Promise<GitLabNote[]> {
    const projectPath = this.encodeProjectPath(url);
    const apiUrl = `${this.baseUrl(url.host)}/projects/${projectPath}/issues/${url.issueIid}/notes?sort=asc&per_page=100`;
    const notes = await this.request<GitLabNote[]>(apiUrl);
    return notes.filter((n) => !n.system);
  }

  async postNote(url: GitLabIssueUrl, body: string): Promise<void> {
    const projectPath = this.encodeProjectPath(url);
    const apiUrl = `${this.baseUrl(url.host)}/projects/${projectPath}/issues/${url.issueIid}/notes`;
    await this.request(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
  }

  private encodeProjectPath(url: GitLabIssueUrl): string {
    const fullPath = url.namespace ? `${url.namespace}/${url.project}` : url.project;
    return encodeURIComponent(fullPath);
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFn(url, {
      ...init,
      headers: {
        "PRIVATE-TOKEN": this.token,
        ...init?.headers
      }
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = (errorBody as { message?: string }).message ?? response.statusText;
      throw new Error(`GitLab API error ${response.status}: ${message}`);
    }

    if (response.status === 201 || response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }
}

export function readGitLabToken(): string {
  const token = process.env["GITLAB_TOKEN"];
  if (!token || token.trim() === "") {
    throw new Error("GITLAB_TOKEN environment variable is not set");
  }
  return token.trim();
}
