export interface VerificationCheck {
  id: string;
  command: string;
  args: string[];
}

export type VerificationStatus = "passed" | "failed";

export interface VerificationCheckResult {
  id: string;
  status: VerificationStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface VerificationReport {
  requirementId: string;
  status: VerificationStatus;
  checks: VerificationCheckResult[];
  startedAt: string;
  finishedAt: string;
}

export interface VerificationCommandRunner {
  (input: { command: string; args: string[]; cwd: string }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}
