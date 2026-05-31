export type RequirementPlanSource = "generated" | "revision";

export interface RequirementPlanVersion {
  planId: string;
  requirementId: string;
  version: number;
  authorUserId: string;
  summary: string;
  markdown: string;
  source: RequirementPlanSource;
  feedback?: string;
  createdAt: string;
}

export interface RequirementPlanGenerationResult {
  summary: string;
  markdown: string;
}
