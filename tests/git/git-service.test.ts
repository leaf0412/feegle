import { describe, expect, it } from "vitest";
import { GitService, type CommandRunner } from "../../src/git/git-service.js";

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
      ["git", "-C", "/tmp/work/web", "commit", "-m", "feat: implement index"],
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
});
