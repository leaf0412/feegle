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

export interface AgentProgressUpdate {
  kind: "thinking" | "tool_use" | "tool_result" | "error" | "info";
  text: string;
  tool?: string;
}

export interface AgentRunOptions {
  onProgress?: (update: AgentProgressUpdate) => void | Promise<void>;
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentCli {
  chat(messages: ReadonlyArray<AgentChatMessage>, options?: AgentRunOptions): Promise<string>;
  generatePrototype(
    context: AgentRequirementContext,
    options?: AgentRunOptions
  ): Promise<PrototypeGenerationResult>;
  generatePlan(context: AgentRequirementContext, options?: AgentRunOptions): Promise<PlanGenerationResult>;
  runDevelopmentTask(
    context: AgentRequirementContext,
    repository: AgentRepositoryContext,
    task: string,
    options?: AgentRunOptions
  ): Promise<DevelopmentTaskResult>;
}
