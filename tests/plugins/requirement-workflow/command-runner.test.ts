import { describe, expect, it } from "vitest";
import { createVerificationCommandRunner } from "@plugins/requirement-workflow/verification/command-runner.js";

describe("createVerificationCommandRunner", () => {
  it("returns exitCode 0 and captures stdout for a successful command", async () => {
    const runner = createVerificationCommandRunner();

    const result = await runner({
      command: "node",
      args: ["-e", "process.stdout.write('ok')"],
      cwd: process.cwd()
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok");
    expect(result.stderr).toBe("");
  });

  it("returns the non-zero exit code WITHOUT throwing when the command exits non-zero", async () => {
    const runner = createVerificationCommandRunner();

    const result = await runner({
      command: "node",
      args: ["-e", "process.exit(3)"],
      cwd: process.cwd()
    });

    expect(result.exitCode).toBe(3);
  });

  it("captures stderr from the command", async () => {
    const runner = createVerificationCommandRunner();

    const result = await runner({
      command: "node",
      args: ["-e", "process.stderr.write('err-output'); process.exit(1)"],
      cwd: process.cwd()
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("err-output");
  });

  it("propagates when the command cannot be spawned (ENOENT)", async () => {
    const runner = createVerificationCommandRunner();

    await expect(
      runner({
        command: "this-command-does-not-exist-feegle-test",
        args: [],
        cwd: process.cwd()
      })
    ).rejects.toThrow();
  });
});
