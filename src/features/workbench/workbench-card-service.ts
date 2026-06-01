import type { WorkbenchStore } from "@features/workbench/workbench-store.js";
import type { ChatWorkbenchState, WorkbenchButton } from "@features/workbench/workbench-models.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { PlatformCard } from "@platform/platform-card.js";
import { renderWorkbenchCard } from "@features/workbench/workbench-card.js";
import { renderWorkbenchRepoManageCard } from "@features/workbench/workbench-repo-manage-card.js";

export interface WorkbenchAgent {
  generatePlan(input: { requirementId: string; requirementText: string; repositories: string[] }): Promise<{ markdown: string }>;
  revisePlan(input: { requirementId: string; currentPlanMarkdown: string; feedback: string }): Promise<{ markdown: string }>;
}

export interface HandleActionOptions {
  formValue?: Record<string, unknown>;
}

export interface WorkbenchCardServiceDeps {
  store: Pick<
    WorkbenchStore,
    "getOrCreate" | "setRequirement" | "setPlan" | "markPlanStale" | "deletePlan" | "deleteRequirement" | "addRepository" | "removeRepository"
  >;
  cloudDoc: FeishuCloudDocClientPort;
  requirementIdFactory: () => string;
  agent: WorkbenchAgent;
}

type View = "main" | "repo_manage";

export class WorkbenchCardService {
  private readonly deps: WorkbenchCardServiceDeps;
  private readonly views = new Map<string, View>();

  constructor(deps: WorkbenchCardServiceDeps) {
    this.deps = deps;
  }

  async getCard(chatId: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    return this.renderCurrentView(chatId, state);
  }

  async handleAction(
    chatId: string,
    action: WorkbenchButton,
    payload?: string,
    options: HandleActionOptions = {}
  ): Promise<PlatformCard> {
    switch (action) {
      case "manage_repos":
        this.views.set(chatId, "repo_manage");
        return this.renderCurrentView(chatId);

      case "add_repo": {
        const url =
          (typeof options.formValue?.repo_url === "string" ? options.formValue.repo_url.trim() : "")
          || (typeof payload === "string" ? payload.trim() : "");
        if (!url) {
          throw new Error("请输入仓库 URL");
        }
        this.deps.store.addRepository(chatId, url);
        this.views.set(chatId, "repo_manage");
        return this.renderCurrentView(chatId);
      }

      case "remove_repo":
        if (!payload) {
          throw new Error("缺少要移除的仓库 URL");
        }
        this.deps.store.removeRepository(chatId, payload);
        this.views.set(chatId, "repo_manage");
        return this.renderCurrentView(chatId);

      case "back":
        this.views.set(chatId, "main");
        return this.renderCurrentView(chatId);

      case "discuss_requirement":
        if (!payload) throw new Error("discuss_requirement requires payload");
        this.views.set(chatId, "main");
        return this.handleDiscussRequirement(chatId, payload);

      case "revise_requirement":
        if (!payload) throw new Error("revise_requirement requires payload");
        this.views.set(chatId, "main");
        return this.handleReviseRequirement(chatId, payload);

      case "generate_plan":
        this.views.set(chatId, "main");
        return this.handleGeneratePlan(chatId);

      case "revise_plan":
        if (!payload) throw new Error("revise_plan requires payload");
        this.views.set(chatId, "main");
        return this.handleRevisePlan(chatId, payload);

      case "delete_plan":
        this.views.set(chatId, "main");
        return this.handleDeletePlan(chatId);

      case "delete_requirement":
        this.views.set(chatId, "main");
        return this.handleDeleteRequirement(chatId);
    }
  }

  private renderCurrentView(chatId: string, state?: ChatWorkbenchState): PlatformCard {
    const view = this.views.get(chatId) ?? "main";
    const resolvedState = state ?? this.deps.store.getOrCreate(chatId);
    return view === "repo_manage"
      ? renderWorkbenchRepoManageCard(resolvedState)
      : renderWorkbenchCard(resolvedState);
  }

  private async handleDiscussRequirement(chatId: string, userInput: string): Promise<PlatformCard> {
    const requirementId = this.deps.requirementIdFactory();
    const firstLine = userInput.split("\n")[0].trim();
    const title = "需求: " + (firstLine.length > 50 ? firstLine.slice(0, 50) + "…" : firstLine);

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: userInput });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setRequirement(chatId, requirementId, userInput, docUrl);

    const state = this.deps.store.getOrCreate(chatId);
    if (state.planText != null) {
      this.deps.store.markPlanStale(chatId);
    }

    return this.renderCurrentView(chatId);
  }

  private async handleReviseRequirement(chatId: string, feedback: string): Promise<PlatformCard> {
    const existing = this.deps.store.getOrCreate(chatId);
    if (!existing.requirementId) {
      throw new Error("Cannot revise requirement: no requirementId");
    }
    const currentText = existing.requirementText ?? "";
    const revisedText = currentText + "\n\n---\n\n## 用户反馈\n\n" + feedback;

    const firstLine = revisedText.split("\n")[0].trim();
    const title = "需求: " + (firstLine.length > 50 ? firstLine.slice(0, 50) + "…" : firstLine);

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: revisedText });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setRequirement(chatId, existing.requirementId, revisedText, docUrl);

    const updatedState = this.deps.store.getOrCreate(chatId);
    if (updatedState.planText != null) {
      this.deps.store.markPlanStale(chatId);
    }

    return this.renderCurrentView(chatId);
  }

  private async handleGeneratePlan(chatId: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    if (!state.requirementText) {
      throw new Error("Cannot generate plan: no requirement set");
    }
    if (!state.requirementId) {
      throw new Error("Cannot generate plan: no requirementId");
    }

    const result = await this.deps.agent.generatePlan({
      requirementId: state.requirementId,
      requirementText: state.requirementText,
      repositories: state.repositories,
    });

    const reqTitle = (state.requirementText.split("\n")[0].trim() || "需求").slice(0, 50);
    const title = "计划: " + reqTitle;

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: result.markdown });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setPlan(chatId, result.markdown, docUrl);
    return this.renderCurrentView(chatId);
  }

  private async handleRevisePlan(chatId: string, feedback: string): Promise<PlatformCard> {
    const state = this.deps.store.getOrCreate(chatId);
    if (!state.planText) {
      throw new Error("Cannot revise plan: no plan exists");
    }
    if (!state.requirementId) {
      throw new Error("Cannot revise plan: no requirementId");
    }

    const result = await this.deps.agent.revisePlan({
      requirementId: state.requirementId,
      currentPlanMarkdown: state.planText,
      feedback,
    });

    const reqTitle = (state.requirementText?.split("\n")[0].trim() || "需求").slice(0, 50);
    const title = "计划: " + reqTitle;

    const { documentId } = await this.deps.cloudDoc.createDoc({ title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: result.markdown });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    this.deps.store.setPlan(chatId, result.markdown, docUrl);
    return this.renderCurrentView(chatId);
  }

  private async handleDeletePlan(chatId: string): Promise<PlatformCard> {
    this.deps.store.deletePlan(chatId);
    return this.renderCurrentView(chatId);
  }

  private async handleDeleteRequirement(chatId: string): Promise<PlatformCard> {
    this.deps.store.deleteRequirement(chatId);
    return this.renderCurrentView(chatId);
  }
}
