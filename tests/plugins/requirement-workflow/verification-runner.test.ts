import { describe, expect, it, vi } from "vitest";
import { VerificationRunner } from "@plugins/requirement-workflow/verification/verification-runner.js";

describe("VerificationRunner", () => {
  it("runs configured checks and returns a failed report when one check fails", async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "unit ok", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "e2e failed" });

    const runner = new VerificationRunner({ runCommand });
    const report = await runner.run({
      requirementId: "reqwf_1",
      worktreePath: "/tmp/worktree",
      checks: [
        { id: "unit", command: "npm", args: ["run", "test:unit"] },
        { id: "e2e", command: "npm", args: ["run", "test:e2e"] }
      ]
    });

    expect(report.status).toBe("failed");
    expect(report.checks.map((check) => check.id)).toEqual(["unit", "e2e"]);
    expect(report.checks[1]).toMatchObject({ status: "failed", stderr: "e2e failed" });
  });

  it("returns a passed report when all checks pass and runs them in order", async () => {
    const calls: string[] = [];
    const runCommand = vi.fn(async (input: { command: string; args: string[]; cwd: string }) => {
      calls.push(`${input.command} ${input.args.join(" ")}`);
      expect(input.cwd).toBe("/tmp/worktree");
      return { exitCode: 0, stdout: "ok", stderr: "" };
    });
    const runner = new VerificationRunner({ runCommand });
    const report = await runner.run({
      requirementId: "reqwf_1",
      worktreePath: "/tmp/worktree",
      checks: [
        { id: "a", command: "npm", args: ["run", "x"] },
        { id: "b", command: "npm", args: ["run", "y"] }
      ]
    });
    expect(report.status).toBe("passed");
    expect(calls).toEqual(["npm run x", "npm run y"]);
    expect(report.checks.every((c) => c.status === "passed")).toBe(true);
  });

  it("default runs ALL checks even after a failure (does not silently skip)", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "boom" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "ok", stderr: "" });
    const runner = new VerificationRunner({ runCommand });
    const report = await runner.run({
      requirementId: "reqwf_1", worktreePath: "/tmp/w",
      checks: [{ id: "a", command: "c", args: [] }, { id: "b", command: "c", args: [] }]
    });
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(report.checks.map((c) => c.id)).toEqual(["a", "b"]);
    expect(report.status).toBe("failed");
  });

  it("stopOnFailure halts after the first failure", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "boom" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "ok", stderr: "" });
    const runner = new VerificationRunner({ runCommand });
    const report = await runner.run({
      requirementId: "reqwf_1", worktreePath: "/tmp/w", stopOnFailure: true,
      checks: [{ id: "a", command: "c", args: [] }, { id: "b", command: "c", args: [] }]
    });
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(report.checks.map((c) => c.id)).toEqual(["a"]);
    expect(report.status).toBe("failed");
  });

  it("propagates when the command runner itself throws (does not treat as a failed check)", async () => {
    const runCommand = vi.fn().mockRejectedValue(new Error("spawn ENOENT"));
    const runner = new VerificationRunner({ runCommand });
    await expect(runner.run({
      requirementId: "reqwf_1", worktreePath: "/tmp/w",
      checks: [{ id: "a", command: "c", args: [] }]
    })).rejects.toThrow("spawn ENOENT");
  });
});
