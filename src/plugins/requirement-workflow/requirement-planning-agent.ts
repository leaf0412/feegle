import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { collectText } from "@integrations/agent/collect-text.js";
import type { RequirementPlanningAgent } from "./requirement-planning-service.js";

const MAX_SUMMARY_LENGTH = 80;
const SUMMARY_STRIP_PATTERN = /^[#\-\s]*/;

function buildGenerationPrompt(requirementText: string): string {
  return (
    `You are a software planning assistant. Given the requirement below, produce:\n` +
    `1. A concise one-line summary (no heading markers, ≤80 chars).\n` +
    `2. A detailed markdown implementation plan with numbered steps.\n\n` +
    `Requirement:\n${requirementText}\n\n` +
    `Respond with the full markdown plan directly. The first line should be the summary.`
  );
}

function buildRevisionPrompt(
  requirementText: string,
  currentPlanMarkdown: string,
  feedback: string
): string {
  return (
    `You are a software planning assistant. Revise the plan below based on the feedback.\n\n` +
    `Requirement:\n${requirementText}\n\n` +
    `Current plan:\n${currentPlanMarkdown}\n\n` +
    `Feedback:\n${feedback}\n\n` +
    `Respond with the revised markdown plan directly. The first line should be a concise one-line summary.`
  );
}

function parseAgentReply(reply: string): { summary: string; markdown: string } {
  const trimmed = reply.trim();
  if (trimmed.length === 0) {
    throw new Error("Agent returned empty plan");
  }
  const markdown = trimmed;
  const firstNonEmptyLine = trimmed
    .split("\n")
    .find((line) => line.trim().length > 0) ?? "";
  const summaryRaw = firstNonEmptyLine.replace(SUMMARY_STRIP_PATTERN, "").trim();
  const summary = summaryRaw.slice(0, MAX_SUMMARY_LENGTH);
  return { summary, markdown };
}

export function createRequirementPlanningAgent(
  agents: AgentProviderRegistry
): RequirementPlanningAgent {
  return {
    async runPlanGeneration({ requirementId: _requirementId, requirementText }) {
      const agent = agents.resolveActiveAgent();
      if (!agent) {
        throw new Error("No active agent provider for requirement planning");
      }
      const prompt = buildGenerationPrompt(requirementText);
      const reply = await collectText(agent, prompt);
      return parseAgentReply(reply);
    },

    async runPlanRevision({ requirementId: _requirementId, requirementText, currentPlanMarkdown, feedback }) {
      const agent = agents.resolveActiveAgent();
      if (!agent) {
        throw new Error("No active agent provider for requirement planning");
      }
      const prompt = buildRevisionPrompt(requirementText, currentPlanMarkdown, feedback);
      const reply = await collectText(agent, prompt);
      return parseAgentReply(reply);
    }
  };
}
