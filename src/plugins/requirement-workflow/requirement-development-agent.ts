import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { RequirementDevelopmentAgent } from "./requirement-execution-service.js";

/**
 * Adapts {@link AgentProviderRegistry} to the {@link RequirementDevelopmentAgent} port.
 *
 * Shape mapping notes:
 * - AgentRequirementContext: { requirementId, title, requirementText }
 *     requirementId → requirementId
 *     title         → requirementId  (no separate title available; use id as label)
 *     requirementText → prompt
 * - AgentRepositoryContext: { repositoryId, localPath, branchName }
 *     repositoryId → requirementId  (no repository id available at this call site)
 *     localPath    → cwd
 *     branchName   → ""  (worktree is already on the target branch)
 * - task → prompt
 * - DevelopmentTaskResult = string (plain string return)
 *     Resolved string → { exitCode: 0, summary: result }
 *     runDevelopmentTask throwing → re-thrown (caller sees the exception; exitCode
 *     never surfaces because the promise rejects rather than resolves with a failure)
 */
export function createRequirementDevelopmentAgent(
  agents: AgentProviderRegistry
): RequirementDevelopmentAgent {
  return {
    async runDevelopmentTask(input: {
      cwd: string;
      prompt: string;
      requirementId: string;
    }): Promise<{ exitCode: number; summary: string }> {
      const agent = agents.resolveActiveAgent();
      if (!agent) {
        throw new Error("No active agent provider for requirement development");
      }

      const requirementContext = {
        requirementId: input.requirementId,
        title: input.requirementId,
        requirementText: input.prompt
      };

      const repositoryContext = {
        repositoryId: input.requirementId,
        localPath: input.cwd,
        branchName: ""
      };

      const summary = await agent.runDevelopmentTask(
        requirementContext,
        repositoryContext,
        input.prompt
      );

      return { exitCode: 0, summary };
    }
  };
}
