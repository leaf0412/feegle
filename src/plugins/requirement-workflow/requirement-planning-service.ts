import type { RequirementPlanVersion } from "./requirement-plan-models.js";

export interface RequirementPlanningAgent {
  runPlanGeneration(input: {
    requirementId: string;
    requirementText: string;
  }): Promise<{ summary: string; markdown: string }>;
  runPlanRevision(input: {
    requirementId: string;
    requirementText: string;
    currentPlanMarkdown: string;
    feedback: string;
  }): Promise<{ summary: string; markdown: string }>;
}

interface RequirementPlanStorePort {
  createVersion(input: {
    requirementId: string;
    authorUserId: string;
    summary: string;
    markdown: string;
    source: "generated" | "revision";
    feedback?: string;
  }): RequirementPlanVersion;
  latest(requirementId: string): RequirementPlanVersion | undefined;
}

interface RequirementPlanningServiceDeps {
  planStore: RequirementPlanStorePort;
  agent: RequirementPlanningAgent;
}

export class RequirementPlanningService {
  private readonly planStore: RequirementPlanStorePort;
  private readonly agent: RequirementPlanningAgent;

  constructor(deps: RequirementPlanningServiceDeps) {
    this.planStore = deps.planStore;
    this.agent = deps.agent;
  }

  async generatePlan(input: {
    requirementId: string;
    requesterUserId: string;
    requirementText: string;
  }): Promise<RequirementPlanVersion> {
    const { summary, markdown } = await this.agent.runPlanGeneration({
      requirementId: input.requirementId,
      requirementText: input.requirementText
    });

    return this.planStore.createVersion({
      requirementId: input.requirementId,
      authorUserId: "agent",
      summary,
      markdown,
      source: "generated"
    });
  }

  async revisePlan(input: {
    requirementId: string;
    requesterUserId: string;
    requirementText: string;
    feedback: string;
  }): Promise<RequirementPlanVersion> {
    const latest = this.planStore.latest(input.requirementId);
    if (latest === undefined) {
      throw new Error(`No plan exists for requirement: ${input.requirementId}`);
    }

    const { summary, markdown } = await this.agent.runPlanRevision({
      requirementId: input.requirementId,
      requirementText: input.requirementText,
      currentPlanMarkdown: latest.markdown,
      feedback: input.feedback
    });

    return this.planStore.createVersion({
      requirementId: input.requirementId,
      authorUserId: "agent",
      summary,
      markdown,
      source: "revision",
      feedback: input.feedback
    });
  }
}
