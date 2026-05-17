import type { RequirementContext, RequirementRepository } from "../domain/models.js";
import { assertTransition } from "../domain/status.js";
import type { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";

export class RequirementService {
  private readonly contexts: RequirementContext[] = [];
  private readonly requirementRepositories: RequirementRepository[] = [];
  private nextRequirementId = 1;
  private nextRequirementRepositoryId = 1;

  constructor(
    private readonly repositoryRegistry: InMemoryRepositoryRegistry,
    private readonly workspaceManager: WorkspaceManager
  ) {}

  startRequirement(chatId: string, title: string): RequirementContext {
    const active = this.contexts.find(
      (context) => context.chatId === chatId && context.status !== "closed"
    );
    if (active) {
      throw new Error(`Chat already has an active requirement: ${chatId}`);
    }

    const now = new Date();
    const context: RequirementContext = {
      id: `req_${this.nextRequirementId++}`,
      chatId,
      title,
      status: "created",
      requirementText: "",
      createdAt: now,
      updatedAt: now
    };
    this.contexts.push(context);

    return copyRequirementContext(context);
  }

  selectRepositories(
    requirementId: string,
    repositoryIds: string[]
  ): {
    context: RequirementContext;
    repositories: RequirementRepository[];
  } {
    const context = this.getContext(requirementId);
    assertTransition(context.status, "repo_selected");
    assertRepositoryIdsNotEmpty(repositoryIds);
    assertUniqueRepositoryIds(repositoryIds);

    const now = new Date();
    const repositories = this.repositoryRegistry.getMany(repositoryIds).map((repository) => {
      const requirementRepository: RequirementRepository = {
        id: `requirement_repo_${this.nextRequirementRepositoryId++}`,
        requirementId,
        repositoryId: repository.id,
        localPath: this.workspaceManager.repositoryWorkingCopy(
          context.chatId,
          requirementId,
          repository.id
        ),
        baseBranch: repository.defaultBaseBranch,
        branchStatus: "not_created",
        pushStatus: "not_ready",
        createdAt: now,
        updatedAt: now
      };

      this.requirementRepositories.push(requirementRepository);

      return requirementRepository;
    });

    context.status = "repo_selected";
    context.updatedAt = now;

    return {
      context: copyRequirementContext(context),
      repositories: repositories.map(copyRequirementRepository)
    };
  }

  private getContext(requirementId: string): RequirementContext {
    const context = this.contexts.find((item) => item.id === requirementId);
    if (!context) {
      throw new Error(`Requirement not found: ${requirementId}`);
    }

    return context;
  }
}

function assertRepositoryIdsNotEmpty(repositoryIds: string[]): void {
  if (repositoryIds.length === 0) {
    throw new Error("At least one repository must be selected");
  }
}

function assertUniqueRepositoryIds(repositoryIds: string[]): void {
  const seen = new Set<string>();
  for (const repositoryId of repositoryIds) {
    if (seen.has(repositoryId)) {
      throw new Error(`Repository selected more than once: ${repositoryId}`);
    }
    seen.add(repositoryId);
  }
}

function copyRequirementContext(context: RequirementContext): RequirementContext {
  return {
    ...context,
    createdAt: new Date(context.createdAt),
    updatedAt: new Date(context.updatedAt)
  };
}

function copyRequirementRepository(repository: RequirementRepository): RequirementRepository {
  return {
    ...repository,
    createdAt: new Date(repository.createdAt),
    updatedAt: new Date(repository.updatedAt)
  };
}
