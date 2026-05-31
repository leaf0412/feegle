import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("runtime platform scenario matrix", () => {
  it("contains all required scenario IDs", () => {
    const matrixPath = join(rootDir, "_docs", "runtime-platform-scenario-matrix.md");
    const matrix = readFileSync(matrixPath, "utf8");

    const required = ["F-01", "F-02", "G-01", "W-01", "S-01", "C-01", "R-01", "M-01", "O-01"];
    for (const id of required) {
      expect(matrix).toContain(id);
    }
  });

  it("has no unapproved defer rows", () => {
    const matrixPath = join(rootDir, "_docs", "runtime-platform-scenario-matrix.md");
    const matrix = readFileSync(matrixPath, "utf8");

    // Find any table row containing "defer" — if found, "accepted-by-product-owner" must also be present
    const lines = matrix.split("\n");
    for (const line of lines) {
      // Only check table rows (lines starting with |)
      if (line.startsWith("|") && line.toLowerCase().includes("defer")) {
        expect(line).toMatch(/accepted-by-product-owner/);
      }
    }
  });

  it("manual testing handoff document references the verify:platform gate and required IDs", () => {
    const handoffPath = join(rootDir, "_docs", "manual-testing-handoff.md");
    const handoff = readFileSync(handoffPath, "utf8");

    expect(handoff).toContain("npm run verify:platform");
    expect(handoff).toContain("workflowInstanceId");
    expect(handoff).toContain("runAttemptId");
    expect(handoff).toContain("diagnostic artifact");
    expect(handoff).toContain("failed trace stage");
  });
});
