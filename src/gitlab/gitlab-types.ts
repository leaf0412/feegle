export interface GitLabIssueUrl {
  host: string;
  namespace: string;
  project: string;
  issueIid: number;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: "opened" | "closed";
  created_at: string;
  updated_at: string;
  assignee: GitLabUser | null;
  due_date: string | null;
  labels: string[];
  web_url: string;
  references?: {
    full: string;
  };
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
}

export interface GitLabNote {
  id: number;
  body: string;
  created_at: string;
  system: boolean;
  author: GitLabUser;
}

export interface GitLabIssueSearchResult {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: "opened" | "closed";
  created_at: string;
  updated_at: string;
  web_url: string;
  labels: string[];
}

export interface GitLabSummarySection {
  issueBasics: string;
  commentSummary: string;
  qaInfo: string;
  aiSummary: string;
  relatedLinks: string;
}

export interface GlsumContext {
  issue: GitLabIssue;
  notes: GitLabNote[];
  qaUrls: string[];
  referencedIssue?: GitLabIssue;
}
