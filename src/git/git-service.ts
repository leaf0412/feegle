import { execa } from "execa";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (command, args) => {
  const result = await execa(command, args);
  return { stdout: result.stdout, stderr: result.stderr };
};

export class GitService {
  constructor(private readonly runner: CommandRunner = defaultRunner) {}

  async clone(remoteUrl: string, localPath: string): Promise<void> {
    await this.runner("git", ["clone", remoteUrl, localPath]);
  }

  async createBranch(localPath: string, baseBranch: string, branchName: string): Promise<void> {
    await this.runner("git", ["-C", localPath, "checkout", baseBranch]);
    await this.runner("git", ["-C", localPath, "checkout", "-b", branchName]);
  }

  async commit(localPath: string, files: string[], message: string): Promise<string> {
    await this.runner("git", ["-C", localPath, "add", "--", ...files]);
    await this.runner("git", ["-C", localPath, "commit", "-m", message, "--only", "--", ...files]);
    const result = await this.runner("git", ["-C", localPath, "rev-parse", "HEAD"]);
    return result.stdout.trim();
  }

  async push(localPath: string, branchName: string): Promise<void> {
    await this.runner("git", ["-C", localPath, "push", "-u", "origin", branchName]);
  }

  async getRepoRoot(path: string): Promise<string> {
    const result = await this.runner("git", ["-C", path, "rev-parse", "--show-toplevel"]);
    return result.stdout.trim();
  }

  async getBranchSha(repoPath: string, branch: string): Promise<string> {
    const result = await this.runner("git", ["-C", repoPath, "rev-parse", branch]);
    return result.stdout.trim();
  }

  async branchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      await this.runner("git", ["-C", repoPath, "rev-parse", "--verify", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  async listRemoteBranches(repoPath: string): Promise<string[]> {
    const result = await this.runner("git", ["-C", repoPath, "branch", "-r"]);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.includes("->"))
      .map((line) => line.replace(/^origin\//, ""));
  }
}
