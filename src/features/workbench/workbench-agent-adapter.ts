import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { collectText } from "@integrations/agent/collect-text.js";
import type { WorkbenchAgent } from "@features/workbench/workbench-card-service.js";

function buildGenerationPrompt(requirementText: string, repositories: string[]): string {
  const repoList = repositories.length > 0
    ? repositories.map((r) => `- ${r}`).join("\n")
    : "(none)";
  return (
    `Based on the requirement below and the bound repositories, produce a detailed implementation plan in markdown. ` +
    `Include numbered steps, file paths, and any assumptions.\n\n` +
    `Requirement:\n${requirementText}\n\n` +
    `Bound repositories:\n${repoList}`
  );
}

function buildRevisionPrompt(currentPlanMarkdown: string, feedback: string): string {
  return (
    `Revise the plan below based on the feedback.\n\n` +
    `Requirement plan:\n${currentPlanMarkdown}\n\n` +
    `Feedback:\n${feedback}\n\n` +
    `Return the complete revised plan.`
  );
}

export function createWorkbenchAgent(registry: AgentProviderRegistry): WorkbenchAgent {
  return {
    async generatePlan({ requirementText, repositories }) {
      const agent = registry.resolveActiveAgent();
      if (!agent) {
        throw new Error("No active agent provider for workbench plan generation");
      }
      const prompt = buildGenerationPrompt(requirementText, repositories);
      const markdown = await collectText(agent, prompt);
      return { markdown };
    },

    async revisePlan({ currentPlanMarkdown, feedback }) {
      const agent = registry.resolveActiveAgent();
      if (!agent) {
        throw new Error("No active agent provider for workbench plan revision");
      }
      const prompt = buildRevisionPrompt(currentPlanMarkdown, feedback);
      const markdown = await collectText(agent, prompt);
      return { markdown };
    }
  };
}
