import type { WorkbenchStore } from "@features/workbench/workbench-store.js";
import type { ChatWorkbenchState, WorkbenchButton } from "@features/workbench/workbench-models.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { PlatformCard } from "@platform/platform-card.js";
import { renderWorkbenchCard } from "@features/workbench/workbench-card.js";

export interface WorkbenchAgent {
  generatePlan(input: { requirementId: string; requirementText: string; repositories: string[] }): Promise<{ markdown: string }>;
  revisePlan(input: { requirementId: string; currentPlanMarkdown: string; feedback: string }): Promise<{ markdown: string }>;
}

export interface WorkbenchCardServiceDeps {
  store: Pick<WorkbenchStore, "getOrCreate" | "setRequirement" | "setPlan" | "markPlanStale" | "deletePlan" | "deleteRequirement">;
  cloudDoc: FeishuCloudDocClientPort;
  requirementIdFactory: () => string;
  agent: WorkbenchAgent;
}

export class WorkbenchCardService {
  private readonly deps: WorkbenchCardServiceDeps;

  constructor(deps: WorkbenchCardServiceDeps) {
    this.deps = deps;
  }

  async getCard(chatId: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    return renderWorkbenchCard(state);
  }

  async handleAction(chatId: string, action: WorkbenchButton, payload?: string): Promise<PlatformCard> {
    switch (action) {
      case "manage_repos":
        return this.getCard(chatId);

      case "discuss_requirement":
        if (!payload) throw new Error("discuss_requirement requires payload");
        return this.handleDiscussRequirement(chatId, payload);

      case "revise_requirement":
        if (!payload) throw new Error("revise_requirement requires payload");
        return this.handleReviseRequirement(chatId, payload);

      case "generate_plan":
        return this.handleGeneratePlan(chatId);

      case "revise_plan":
        if (!payload) throw new Error("revise_plan requires payload");
        return this.handleRevisePlan(chatId, payload);

      case "delete_plan":
        return this.handleDeletePlan(chatId);

      case "delete_requirement":
        return this.handleDeleteRequirement(chatId);
    }
  }

  private async handleDiscussRequirement(chatId: string, userInput: string): Promise<PlatformCard> {
    const requirementId = this.deps.requirementIdFactory();
    const firstLine = userInput.split("\n")[0].trim();
    const title = "需求: " + (firstLine.length > 50 ? firstLine.slice(0, 50) + "…" : firstLine);

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: userInput });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setRequirement(chatId, userInput, docUrl);

    const state = this.deps.store.getOrCreate(chatId);
    if (state.planText != null) {
      this.deps.store.markPlanStale(chatId);
    }

    return this.getCard(chatId);
  }

  private async handleReviseRequirement(chatId: string, feedback: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    const currentText = state.requirementText ?? "";
    const revisedText = currentText + "\n\n---\n\n## 用户反馈\n\n" + feedback;

    const firstLine = revisedText.split("\n")[0].trim();
    const title = "需求: " + (firstLine.length > 50 ? firstLine.slice(0, 50) + "…" : firstLine);

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: revisedText });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setRequirement(chatId, revisedText, docUrl);

    const updatedState = this.deps.store.getOrCreate(chatId);
    if (updatedState.planText != null) {
      this.deps.store.markPlanStale(chatId);
    }

    return this.getCard(chatId);
  }

  private async handleGeneratePlan(chatId: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    if (!state.requirementText) {
      throw new Error("Cannot generate plan: no requirement set");
    }

    const requirementId = this.deps.requirementIdFactory();
    const result = await this.deps.agent.generatePlan({
      requirementId,
      requirementText: state.requirementText,
      repositories: state.repositories,
    });

    const reqTitle = (state.requirementText.split("\n")[0].trim() || "需求").slice(0, 50);
    const title = "计划: " + reqTitle;

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: result.markdown });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setPlan(chatId, result.markdown, docUrl);
    return this.getCard(chatId);
  }

  private async handleRevisePlan(chatId: string, feedback: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    if (!state.planText) {
      throw new Error("Cannot revise plan: no plan exists");
    }

    const requirementId = this.deps.requirementIdFactory();
    const result = await this.deps.agent.revisePlan({
      requirementId,
      currentPlanMarkdown: state.planText,
      feedback,
    });

    const reqTitle = (state.requirementText?.split("\n")[0].trim() || "需求").slice(0, 50);
    const title = "计划: " + reqTitle;

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: result.markdown });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setPlan(chatId, result.markdown, docUrl);
    return this.getCard(chatId);
  }

  private async handleDeletePlan(chatId: string): Promise<PlatformCard> {
    this.deps.store.deletePlan(chatId);
    return this.getCard(chatId);
  }

  private async handleDeleteRequirement(chatId: string): Promise<PlatformCard> {
    this.deps.store.deleteRequirement(chatId);
    return this.getCard(chatId);
  }
}
