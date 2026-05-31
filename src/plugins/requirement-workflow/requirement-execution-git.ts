import { execa } from "execa";
import type { GitService } from "@infra/git/git-service.js";
import type { RequirementExecutionGit } from "./requirement-execution-service.js";

/**
 * Parse the output of `git diff --numstat` into aggregate counts.
 *
 * Each line has the format: <insertions>\t<deletions>\t<file>
 * Binary files use "-" for both counts; treat them as 0.
 *
 * Exported for isolated unit testing.
 */
export function parseNumstat(stdout: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let insertions = 0;
  let deletions = 0;

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }
    const added = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10);
    const removed = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10);
    insertions += Number.isFinite(added) ? added : 0;
    deletions += Number.isFinite(removed) ? removed : 0;
  }

  return { filesChanged: lines.length, insertions, deletions };
}

async function detectCurrentBranch(repoPath: string): Promise<string> {
  const result = await execa("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], {
    reject: false
  });

  if (result.exitCode !== 0 || result.stdout.trim() === "") {
    throw new Error(
      `Failed to detect current branch of repository at "${repoPath}": ${result.stderr.trim() || "empty output"}`
    );
  }

  const branch = result.stdout.trim();

  if (branch === "HEAD") {
    throw new Error(
      `Repository at "${repoPath}" is in detached HEAD state — cannot determine base branch for worktree creation`
    );
  }

  return branch;
}

/**
 * Adapts {@link GitService} to the {@link RequirementExecutionGit} port.
 *
 * The key differences handled here:
 * - createWorktree: the port omits baseBranch; we detect it from the repo's
 *   current branch via `git rev-parse --abbrev-ref HEAD`. Throws explicitly
 *   if detection fails — never silently defaults to a wrong branch.
 * - diffStats: port wants {filesChanged,insertions,deletions}; real GitService
 *   returns {commitCount,filesChanged} without insertions/deletions. We run
 *   `git diff --numstat` against the working tree instead.
 */
export function createRequirementExecutionGit(git: GitService): RequirementExecutionGit {
  return {
    getRepoRoot(workspacePath: string): Promise<string> {
      return git.getRepoRoot(workspacePath);
    },

    async createWorktree(input: {
      repoPath: string;
      worktreePath: string;
      newBranch: string;
    }): Promise<void> {
      const baseBranch = await detectCurrentBranch(input.repoPath);
      await git.createWorktree({
        repoPath: input.repoPath,
        worktreePath: input.worktreePath,
        newBranch: input.newBranch,
        baseBranch
      });
    },

    async diffStats(input: { worktreePath: string }): Promise<{
      filesChanged: number;
      insertions: number;
      deletions: number;
    }> {
      const result = await execa(
        "git",
        ["-C", input.worktreePath, "diff", "--numstat"],
        { reject: false }
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `git diff --numstat failed in "${input.worktreePath}": ${result.stderr.trim()}`
        );
      }

      return parseNumstat(result.stdout);
    }
  };
}
