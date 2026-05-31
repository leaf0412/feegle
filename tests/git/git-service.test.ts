import { describe, expect, it } from "vitest";
import { GitService, type CommandRunner } from "../../src/infra/git/git-service.js";

describe("GitService", () => {
  it("clones a repository into the requested path", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.clone("git@example.com:team/web.git", "/tmp/work/web");

    expect(calls).toEqual([["git", "clone", "git@example.com:team/web.git", "/tmp/work/web"]]);
  });

  it("creates a local branch from a base branch", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.createBranch("/tmp/work/web", "main", "yb/feat/req_retry");

    expect(calls).toEqual([
      ["git", "-C", "/tmp/work/web", "checkout", "main"],
      ["git", "-C", "/tmp/work/web", "checkout", "-b", "yb/feat/req_retry"]
    ]);
  });

  it("commits selected files and returns the created commit hash", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      const stdout = command === "git" && args.at(-2) === "rev-parse" ? " abc123 \n" : "";
      return { stdout, stderr: "" };
    };
    const service = new GitService(runner);

    const commitHash = await service.commit(
      "/tmp/work/web",
      ["src/index.ts", "tests/index.test.ts"],
      "feat: implement index"
    );

    expect(commitHash).toBe("abc123");
    expect(calls).toEqual([
      ["git", "-C", "/tmp/work/web", "add", "--", "src/index.ts", "tests/index.test.ts"],
      [
        "git",
        "-C",
        "/tmp/work/web",
        "commit",
        "-m",
        "feat: implement index",
        "--only",
        "--",
        "src/index.ts",
        "tests/index.test.ts"
      ],
      ["git", "-C", "/tmp/work/web", "rev-parse", "HEAD"]
    ]);
  });

  it("separates option-like file names from git add options", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      const stdout = command === "git" && args.at(-2) === "rev-parse" ? "abc123" : "";
      return { stdout, stderr: "" };
    };
    const service = new GitService(runner);

    await service.commit("/tmp/work/web", ["--all"], "feat: commit option-like file");

    expect(calls[0]).toEqual(["git", "-C", "/tmp/work/web", "add", "--", "--all"]);
    expect(calls[1]).toEqual([
      "git",
      "-C",
      "/tmp/work/web",
      "commit",
      "-m",
      "feat: commit option-like file",
      "--only",
      "--",
      "--all"
    ]);
  });

  it("surfaces commit command failures and stops later git commands", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      if (args.includes("add")) {
        throw new Error("git add failed");
      }
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await expect(service.commit("/tmp/work/web", ["src/index.ts"], "feat: broken")).rejects.toThrow(
      "git add failed"
    );
    expect(calls).toEqual([["git", "-C", "/tmp/work/web", "add", "--", "src/index.ts"]]);
  });

  it("pushes a branch to origin and sets upstream tracking", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.push("/tmp/work/web", "yb/feat/req_retry");

    expect(calls).toEqual([
      ["git", "-C", "/tmp/work/web", "push", "-u", "origin", "yb/feat/req_retry"]
    ]);
  });

  it("returns the git repo root for a path inside the working tree", async () => {
    const runner: CommandRunner = async () => ({
      stdout: "/Users/yb/code/project\n",
      stderr: ""
    });
    const service = new GitService(runner);

    expect(await service.getRepoRoot("/Users/yb/code/project/sub")).toBe("/Users/yb/code/project");
  });

  it("returns the sha of a branch", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "abc1234567\n", stderr: "" };
    };
    const service = new GitService(runner);

    expect(await service.getBranchSha("/tmp/repo", "main")).toBe("abc1234567");
    expect(calls).toEqual([["git", "-C", "/tmp/repo", "rev-parse", "main"]]);
  });

  it("returns true when a local branch exists, false otherwise", async () => {
    const runner: CommandRunner = async (_command, args) => {
      if (args.includes("refs/heads/main")) {
        return { stdout: "abc\n", stderr: "" };
      }
      throw new Error("fatal: ambiguous argument 'refs/heads/missing'");
    };
    const service = new GitService(runner);

    expect(await service.branchExists("/tmp/repo", "main")).toBe(true);
    expect(await service.branchExists("/tmp/repo", "missing")).toBe(false);
  });

  it("lists remote branches without origin/ prefix or HEAD pointer", async () => {
    const runner: CommandRunner = async () => ({
      stdout: "  origin/HEAD -> origin/main\n  origin/main\n  origin/beta\n  origin/feature/x\n",
      stderr: ""
    });
    const service = new GitService(runner);

    expect(await service.listRemoteBranches("/tmp/repo")).toEqual(["main", "beta", "feature/x"]);
  });

  it("creates a worktree from a base branch with a new head branch", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.createWorktree({
      repoPath: "/tmp/repo",
      worktreePath: "/tmp/wt/plan_1",
      baseBranch: "main",
      newBranch: "yb/feat/plan_1"
    });

    expect(calls).toEqual([
      ["git", "-C", "/tmp/repo", "worktree", "add", "-b", "yb/feat/plan_1", "/tmp/wt/plan_1", "main"]
    ]);
  });

  it("removes a worktree by path", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.removeWorktree("/tmp/repo", "/tmp/wt/plan_1");

    expect(calls).toEqual([["git", "-C", "/tmp/repo", "worktree", "remove", "/tmp/wt/plan_1"]]);
  });

  it("treats empty git-status porcelain output as clean", async () => {
    let stdout = "";
    const runner: CommandRunner = async () => ({ stdout, stderr: "" });
    const service = new GitService(runner);

    expect(await service.isClean("/tmp/wt")).toBe(true);
    stdout = " M src/a.ts\n";
    expect(await service.isClean("/tmp/wt")).toBe(false);
  });

  it("returns commit count and changed file count between base sha and HEAD", async () => {
    const responses: Record<string, string> = {
      "rev-list": "3\n",
      diff: "src/a.ts\nsrc/b.ts\ntests/c.test.ts\n"
    };
    const runner: CommandRunner = async (_command, args) => {
      if (args.includes("rev-list")) return { stdout: responses["rev-list"]!, stderr: "" };
      return { stdout: responses.diff!, stderr: "" };
    };
    const service = new GitService(runner);

    expect(await service.diffStats("/tmp/wt", "base_sha_abc")).toEqual({
      commitCount: 3,
      filesChanged: 3
    });
  });
});
