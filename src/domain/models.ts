import type { RequirementStatus } from "./status.js";

export interface RepositoryRecord {
  id: string;
  name: string;
  remoteUrl: string;
  defaultBaseBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequirementContext {
  id: string;
  chatId: string;
  title: string;
  status: RequirementStatus;
  requirementText: string;
  prototypeZipPath?: string;
  planPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequirementRepository {
  id: string;
  requirementId: string;
  repositoryId: string;
  localPath: string;
  baseBranch: string;
  suggestedBranch?: string;
  activeBranch?: string;
  branchStatus: "not_created" | "created";
  pushStatus: "not_ready" | "ready" | "pushed";
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRun {
  id: string;
  requirementId: string;
  kind: "prototype" | "plan" | "development";
  status: "queued" | "running" | "succeeded" | "failed";
  prompt: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface RequirementCommit {
  id: string;
  requirementId: string;
  repositoryId: string;
  commitHash: string;
  commitMessage: string;
  stepTitle: string;
  createdAt: Date;
  pushedAt?: Date;
}
