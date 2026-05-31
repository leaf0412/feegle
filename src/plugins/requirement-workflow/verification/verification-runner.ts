import type {
  VerificationCheck,
  VerificationCheckResult,
  VerificationCommandRunner,
  VerificationReport,
  VerificationStatus
} from "./verification-models.js";

interface VerificationRunnerDeps {
  runCommand: VerificationCommandRunner;
}

interface RunInput {
  requirementId: string;
  worktreePath: string;
  checks: VerificationCheck[];
  stopOnFailure?: boolean;
}

async function runSingleCheck(
  check: VerificationCheck,
  worktreePath: string,
  runCommand: VerificationCommandRunner
): Promise<VerificationCheckResult> {
  const startMs = Date.now();
  const result = await runCommand({ command: check.command, args: check.args, cwd: worktreePath });
  const durationMs = Date.now() - startMs;

  const status: VerificationStatus = result.exitCode === 0 ? "passed" : "failed";

  return {
    id: check.id,
    status,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs
  };
}

function deriveOverallStatus(checkResults: VerificationCheckResult[]): VerificationStatus {
  return checkResults.some((c) => c.status === "failed") ? "failed" : "passed";
}

export class VerificationRunner {
  private readonly runCommand: VerificationCommandRunner;

  constructor({ runCommand }: VerificationRunnerDeps) {
    this.runCommand = runCommand;
  }

  async run(input: RunInput): Promise<VerificationReport> {
    const { requirementId, worktreePath, checks, stopOnFailure = false } = input;
    const startedAt = new Date().toISOString();
    const checkResults: VerificationCheckResult[] = [];

    for (const check of checks) {
      const checkResult = await runSingleCheck(check, worktreePath, this.runCommand);
      checkResults.push(checkResult);

      if (stopOnFailure && checkResult.status === "failed") {
        break;
      }
    }

    const finishedAt = new Date().toISOString();

    return {
      requirementId,
      status: deriveOverallStatus(checkResults),
      checks: checkResults,
      startedAt,
      finishedAt
    };
  }
}
