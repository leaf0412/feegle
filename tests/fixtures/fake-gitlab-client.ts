export interface RecordedGitLabComment {
  projectId: number;
  issueIid: number;
  body: string;
}

export interface RecordedGitLabStatus {
  projectId: number;
  sha: string;
  status: string;
}

/**
 * Fake GitLab client that records all calls in memory.
 * Used in E2E tests to verify effect execution without real network IO.
 */
export class FakeGitLabClient {
  comments: RecordedGitLabComment[] = [];
  statuses: RecordedGitLabStatus[] = [];

  async addIssueComment(projectId: number, issueIid: number, body: string): Promise<void> {
    this.comments.push({ projectId, issueIid, body });
  }

  async updateCommitStatus(projectId: number, sha: string, status: string): Promise<void> {
    this.statuses.push({ projectId, sha, status });
  }

  reset(): void {
    this.comments = [];
    this.statuses = [];
  }
}
