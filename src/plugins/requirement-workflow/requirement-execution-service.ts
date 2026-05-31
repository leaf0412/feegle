import { join } from "node:path";

// Port: minimal git operations needed for requirement execution.
// NOTE: Shape differs from the real GitService:
//   - diffStats here takes {worktreePath} (object) and returns {filesChanged,insertions,deletions}.
//     The real GitService.diffStats(worktreePath: string, baseSha: string) takes positional args
//     and returns {commitCount, filesChanged} without insertions/deletions.
//   - createWorktree is compatible: real GitService also accepts {repoPath, worktreePath, newBranch, baseBranch};
//     this port omits the optional baseBranch field, which the real service requires.
//   Future wiring will need an adapter or update to the real GitService.
export interface RequirementExecutionGit {
  getRepoRoot(workspacePath: string): Promise<string>;
  createWorktree(input: {
    repoPath: string;
    worktreePath: string;
    newBranch: string;
  }): Promise<void>;
  diffStats(input: { worktreePath: string }): Promise<{
    filesChanged: number;
    insertions: number;
    deletions: number;
  }>;
}

export interface RequirementDevelopmentAgent {
  runDevelopmentTask(input: {
    cwd: string;
    prompt: string;
    requirementId: string;
  }): Promise<{ exitCode: number; summary: string }>;
}

interface RequirementExecutionStorePort {
  latest(requirementId: string): { requirementId: string; status: string; planVersion: number } | undefined;
  markExecuting(input: {
    requirementId: string;
    approvedByUserId: string;
    worktreePath: string;
    headBranch: string;
  }): void;
  markImplementationReady(input: {
    requirementId: string;
    summary: string;
    diffStats: { filesChanged: number; insertions: number; deletions: number };
  }): void;
}

interface RequirementExecutionServiceDeps {
  git: RequirementExecutionGit;
  agent: RequirementDevelopmentAgent;
  executionStore: RequirementExecutionStorePort;
  workspacePath: string;
  worktreeRoot: string;
}

export interface ExecuteRequirementResult {
  requirementId: string;
  status: "implementation_ready";
  headBranch: string;
  worktreePath: string;
  summary: string;
  diffStats: { filesChanged: number; insertions: number; deletions: number };
}

function buildDevelopmentPrompt(requirementId: string, planMarkdown: string): string {
  return `Requirement ID: ${requirementId}\n\n${planMarkdown}`;
}

export class RequirementExecutionService {
  private readonly git: RequirementExecutionGit;
  private readonly agent: RequirementDevelopmentAgent;
  private readonly executionStore: RequirementExecutionStorePort;
  private readonly workspacePath: string;
  private readonly worktreeRoot: string;

  constructor(deps: RequirementExecutionServiceDeps) {
    this.git = deps.git;
    this.agent = deps.agent;
    this.executionStore = deps.executionStore;
    this.workspacePath = deps.workspacePath;
    this.worktreeRoot = deps.worktreeRoot;
  }

  async execute(input: {
    requirementId: string;
    planMarkdown: string;
    approvedByUserId: string;
  }): Promise<ExecuteRequirementResult> {
    const { requirementId, planMarkdown, approvedByUserId } = input;

    const headBranch = `yb/feat/${requirementId}`;
    const worktreePath = join(this.worktreeRoot, requirementId);

    const repoPath = await this.git.getRepoRoot(this.workspacePath);

    this.executionStore.markExecuting({ requirementId, approvedByUserId, worktreePath, headBranch });

    await this.git.createWorktree({ repoPath, worktreePath, newBranch: headBranch });

    const prompt = buildDevelopmentPrompt(requirementId, planMarkdown);
    const agentResult = await this.agent.runDevelopmentTask({ cwd: worktreePath, prompt, requirementId });

    if (agentResult.exitCode !== 0) {
      throw new Error(`Requirement execution failed: ${agentResult.summary || agentResult.exitCode}`);
    }

    const diffStats = await this.git.diffStats({ worktreePath });

    this.executionStore.markImplementationReady({ requirementId, summary: agentResult.summary, diffStats });

    return {
      requirementId,
      status: "implementation_ready",
      headBranch,
      worktreePath,
      summary: agentResult.summary,
      diffStats
    };
  }
}
