export interface ChatWorkbenchState {
  chatId: string;
  repositories: string[];
  requirementId: string | null;
  requirementText: string | null;
  requirementDocUrl: string | null;
  requirementVersion: number;
  planText: string | null;
  planDocUrl: string | null;
  planVersion: number;
  planStale: boolean;
  updatedAt: string;
}

export type WorkbenchButton =
  | "manage_repos"
  | "add_repo"
  | "remove_repo"
  | "back"
  | "discuss_requirement"
  | "revise_requirement"
  | "generate_plan"
  | "revise_plan"
  | "delete_requirement"
  | "delete_plan";

export type WorkbenchView = "main" | "repo_manage";
