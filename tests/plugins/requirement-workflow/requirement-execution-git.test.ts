import { describe, expect, it, vi } from "vitest";
import {
  createRequirementExecutionGit,
  parseNumstat
} from "@plugins/requirement-workflow/requirement-execution-git.js";

// ---------------------------------------------------------------------------
// parseNumstat — pure function, no I/O
// ---------------------------------------------------------------------------

describe("parseNumstat", () => {
  it("parses standard numstat output", () => {
    const stdout = "3\t1\tsrc/a.ts\n0\t2\tsrc/b.ts";
    const result = parseNumstat(stdout);

    expect(result.filesChanged).toBe(2);
    expect(result.insertions).toBe(3);
    expect(result.deletions).toBe(3);
  });

  it("treats '-' (binary file marker) as 0 insertions and 0 deletions", () => {
    const stdout = "-\t-\tsrc/image.png\n5\t2\tsrc/text.ts";
    const result = parseNumstat(stdout);

    expect(result.filesChanged).toBe(2);
    expect(result.insertions).toBe(5);
    expect(result.deletions).toBe(2);
  });

  it("returns zeros for empty output (no changed files)", () => {
    const result = parseNumstat("");

    expect(result.filesChanged).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("handles Windows-style line endings", () => {
    const stdout = "1\t0\tsrc/a.ts\r\n2\t3\tsrc/b.ts";
    const result = parseNumstat(stdout);

    expect(result.filesChanged).toBe(2);
    expect(result.insertions).toBe(3);
    expect(result.deletions).toBe(3);
  });

  it("counts all non-empty lines as filesChanged but skips numeric parsing for malformed lines", () => {
    // A line with only one tab-separated segment is counted as a file (lines.length)
    // but its numeric columns cannot be parsed, so it contributes 0 to insertions/deletions.
    const stdout = "only-one-field\n3\t1\tsrc/a.ts";
    const result = parseNumstat(stdout);

    expect(result.filesChanged).toBe(2);
    expect(result.insertions).toBe(3);
    expect(result.deletions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// createRequirementExecutionGit — adapts GitService
// ---------------------------------------------------------------------------

function makeGitService() {
  return {
    getRepoRoot: vi.fn().mockResolvedValue("/repo/root"),
    createWorktree: vi.fn().mockResolvedValue(undefined)
  };
}

describe("createRequirementExecutionGit", () => {
  describe("getRepoRoot", () => {
    it("delegates to the underlying GitService", async () => {
      const git = makeGitService();
      const adapter = createRequirementExecutionGit(git as never);

      const root = await adapter.getRepoRoot("/workspace/path");

      expect(git.getRepoRoot).toHaveBeenCalledWith("/workspace/path");
      expect(root).toBe("/repo/root");
    });
  });

  describe("createWorktree", () => {
    it("detects the current branch and forwards it to GitService as baseBranch", async () => {
      const git = makeGitService();
      const adapter = createRequirementExecutionGit(git as never);

      // We cannot easily mock execa in this test, so we use a real repo path
      // (the feegle repo itself). The test verifies the delegation contract: all
      // three fields from the port input arrive at git.createWorktree plus
      // an auto-detected baseBranch string.
      await adapter.createWorktree({
        repoPath: process.cwd(),
        worktreePath: "/tmp/feegle-worktree-test",
        newBranch: "yb/test/wt-adapter"
      });

      expect(git.createWorktree).toHaveBeenCalledOnce();
      const callArg = git.createWorktree.mock.calls[0][0] as {
        repoPath: string;
        worktreePath: string;
        newBranch: string;
        baseBranch: string;
      };
      expect(callArg.repoPath).toBe(process.cwd());
      expect(callArg.worktreePath).toBe("/tmp/feegle-worktree-test");
      expect(callArg.newBranch).toBe("yb/test/wt-adapter");
      // baseBranch must be a non-empty string (auto-detected from current branch)
      expect(typeof callArg.baseBranch).toBe("string");
      expect(callArg.baseBranch.length).toBeGreaterThan(0);
    });

    it("throws when baseBranch detection fails (invalid repo path)", async () => {
      const git = makeGitService();
      const adapter = createRequirementExecutionGit(git as never);

      await expect(
        adapter.createWorktree({
          repoPath: "/path/that/does/not/exist-feegle-test",
          worktreePath: "/tmp/out",
          newBranch: "feature/x"
        })
      ).rejects.toThrow();

      // GitService.createWorktree must NOT be called when detection fails
      expect(git.createWorktree).not.toHaveBeenCalled();
    });
  });

  describe("diffStats", () => {
    it("returns {filesChanged, insertions, deletions} from the working tree of the current repo", async () => {
      const git = makeGitService();
      const adapter = createRequirementExecutionGit(git as never);

      // Using the actual feegle repo as the worktreePath — the working tree
      // may or may not have changes; either way the shape must be valid.
      const stats = await adapter.diffStats({ worktreePath: process.cwd() });

      expect(typeof stats.filesChanged).toBe("number");
      expect(typeof stats.insertions).toBe("number");
      expect(typeof stats.deletions).toBe("number");
      expect(stats.filesChanged).toBeGreaterThanOrEqual(0);
    });
  });
});
