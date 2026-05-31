import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const statusPath = join(root, "_docs/plans/2026-05-31-runtime-platform-status.md");
const nestedStatusPath = join(root, "_docs/_docs/plans/2026-05-31-runtime-platform-status.md");

describe("runtime platform status document", () => {
  it("lives at the planned path", () => {
    expect(existsSync(statusPath)).toBe(true);
  });

  it("does not exist at the old nested path", () => {
    expect(existsSync(nestedStatusPath)).toBe(false);
  });

  it("contains status entries for plans 25-35", () => {
    const content = readFileSync(statusPath, "utf8");
    // Plans must appear in status tables — either as "Plan N" references
    // (e.g. Follow-up column) or as first-column rows like `| 25 |`.
    for (let i = 25; i <= 35; i++) {
      const hasReference = content.includes(`Plan ${i}`) || content.includes(`| ${i} |`);
      expect(hasReference).toBe(true);
    }
  });

  it("contains the verify:platform gate reference", () => {
    const content = readFileSync(statusPath, "utf8");
    expect(content).toContain("verify:platform");
  });

  it("mentions that human testing waits for verify:platform", () => {
    const content = readFileSync(statusPath, "utf8");
    expect(content).toContain("Human testing");
  });
});
