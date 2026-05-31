import { execa } from "execa";
import type { VerificationCommandRunner } from "./verification-models.js";

/**
 * Creates a VerificationCommandRunner that runs a command via execa.
 *
 * Non-zero exit codes are captured and returned — they do NOT cause a throw.
 * Spawn failures (ENOENT, permission denied, etc.) propagate as thrown errors
 * so callers can distinguish "command not found" from "command ran and failed".
 * A spawn failure is identified by result.exitCode being undefined (the process
 * never started) combined with result.failed being true.
 */
export function createVerificationCommandRunner(): VerificationCommandRunner {
  return async function runVerificationCommand({ command, args, cwd }) {
    const result = await execa(command, args, { cwd, reject: false });

    if (result.failed && result.exitCode === undefined) {
      // The process failed to spawn (ENOENT, EACCES, etc.) — propagate.
      throw new Error(result.shortMessage ?? `Failed to spawn command: ${command}`);
    }

    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.stderr
    };
  };
}
