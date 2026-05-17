export interface AgentRequirementContext {
  requirementId: string;
  title: string;
  requirementText: string;
}

export interface AgentRepositoryContext {
  repositoryId: string;
  localPath: string;
  branchName: string;
}

export type PrototypeGenerationResult = string;
export type PlanGenerationResult = string;
export type DevelopmentTaskResult = string;

export interface AgentCli {
  generatePrototype(context: AgentRequirementContext): Promise<PrototypeGenerationResult>;
  generatePlan(context: AgentRequirementContext): Promise<PlanGenerationResult>;
  runDevelopmentTask(
    context: AgentRequirementContext,
    repository: AgentRepositoryContext,
    task: string
  ): Promise<DevelopmentTaskResult>;
}
