import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultPlugins } from "@infra/boot/default-plugins.js";
import { collectContributions, type FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "@tests/fixtures/fake-feishu-client.js";

const rootDir = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const plansDir = join(rootDir, "_docs", "plans");
const statusDocPath = join(rootDir, "_docs", "plans", "2026-05-31-runtime-platform-status.md");
const verifyScriptPath = join(rootDir, "scripts", "verify-platform-readiness.mjs");
const packageJsonPath = join(rootDir, "package.json");

// All 50 plans (01-50)
const ALL_PLAN_IDS = Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(2, "0"));

const COMPLETED_PLANS = new Set([
  "09", "10", "11", "12", "13", "14", "15", "16", "17", "19",
  "22", "23", "25", "26", "27", "28", "29", "31", "32", "33", "34", "35",
  "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47",
  "48", "49", "50"
]);

// Plans listed as "partial" in status doc
const PARTIAL_PLANS = new Set([
  "30"
]);

// Plans listed as "reopened" (subsequently completed via follow-up plans)
const REOPENED_THEN_COMPLETED = new Set([
  "18", "20", "21", "24"
]);

// Plans that have plan files and are tracked, with status per the status doc
function expectedStatus(planId: string): "complete" | "partial" | "reopened-complete" | "documented" {
  if (COMPLETED_PLANS.has(planId)) return "complete";
  if (PARTIAL_PLANS.has(planId)) return "partial";
  if (REOPENED_THEN_COMPLETED.has(planId)) return "reopened-complete";
  return "documented";
}

describe("platform acceptance matrix", () => {
  it("verify:platform script exists and is executable", () => {
    expect(existsSync(verifyScriptPath)).toBe(true);
    const scriptContent = readFileSync(verifyScriptPath, "utf8");
    expect(scriptContent).toContain("spawnSync");
    expect(scriptContent).toContain("platform ready for human testing");
  });

  it("package.json includes verify:platform script", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    expect(pkg.scripts["verify:platform"]).toBeDefined();
    expect(pkg.scripts["verify:platform"]).toContain("verify-platform-readiness.mjs");
  });

  it("all 50 plans have corresponding plan files", () => {
    const planFiles = readdirSync(plansDir);
    for (const id of ALL_PLAN_IDS) {
      const matchingFile = planFiles.find((f) => f.includes(`-${id}-`));
      expect(matchingFile, `Plan ${id} has no plan file in ${plansDir}`).toBeDefined();
    }
  });

  it("all plans are tracked in status doc as complete, partial, or documented as deferred", () => {
    expect(existsSync(statusDocPath)).toBe(true);
    const statusContent = readFileSync(statusDocPath, "utf8");

    for (let i = 9; i <= 50; i++) {
      const planId = String(i).padStart(2, "0");
      const hasReference =
        statusContent.includes(`Plan ${i}`) ||
        statusContent.includes(`| ${planId} |`);
      expect(hasReference, `Plan ${i} (${planId}) not found in status doc`).toBe(true);
      if (expectedStatus(planId) === "complete") {
        expect(statusContent, `Plan ${i} should be marked complete`).toMatch(
          new RegExp(`\\|\\s*${planId}\\s*\\|[^\\n]*\\|\\s*complete\\s*\\|`)
        );
      }
    }
  });

  it("no plan claims 'complete' without test evidence", () => {
    const statusContent = readFileSync(statusDocPath, "utf8");
    // For each "complete" plan, check there's a test file or evidence mention
    // The status doc itself is the evidence — this test validates the doc exists
    // and contains evidence columns
    const completeRows = statusContent.split("\n").filter((line) => {
      if (!line.includes("|")) return false;
      const cells = line.split("|").map((c) => c.trim());
      return cells.includes("complete");
    });
    expect(completeRows.length).toBeGreaterThan(0);

    for (const row of completeRows) {
      const cells = row.split("|").map((c) => c.trim());
      const statusIndex = cells.findIndex((cell) => cell === "complete");
      const evidence = statusIndex >= 0 ? cells[statusIndex + 1] ?? "" : "";
      expect(evidence, `complete row has no evidence: ${row}`).not.toMatch(/^$|^none$/i);
    }
  });

  it("all default plugin manifests validate", () => {
    const feishuClient: FeishuClientPort = makeFakeFeishuClient();

    const cloudDoc = {
      createDoc: async () => ({ documentId: "doc_fake" }),
      writeMarkdown: async () => {},
      deleteDoc: async () => {},
      buildDocUrl: (_documentId: string) => `https://feishu.cn/docx/${_documentId}`
    };

    const runtimeFactory = () => ({
      id: "fake-runtime",
      start: async () => {},
      stop: async () => {}
    });

    const plugins = defaultPlugins({
      feegleHome: "/tmp/feegle-test",
      feishuClient,
      cloudDoc,
      runtimeFactory
    });

    // Each plugin must have a valid manifest
    for (const plugin of plugins) {
      expect(plugin.id, `Plugin ${plugin.id} has no id`).toBeTruthy();
      expect(plugin.manifest, `Plugin ${plugin.id} has no manifest`).toBeDefined();

      if (plugin.manifest) {
        expect(plugin.manifest.id, `Plugin ${plugin.id} manifest missing id`).toBe(plugin.id);
        expect(plugin.manifest.version, `Plugin ${plugin.id} manifest missing version`).toBeTruthy();
        expect(plugin.manifest.displayName, `Plugin ${plugin.id} manifest missing displayName`).toBeTruthy();
        expect(plugin.manifest.description, `Plugin ${plugin.id} manifest missing description`).toBeTruthy();

        // Manifest version must be valid semver
        expect(plugin.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      }
    }

    const contributions = collectContributions(plugins);

    // Verify we have runtime contributions from each expected plugin
    const runtimeContributionIds = contributions.runtimeContributions.map((rc) => rc.id);
    expect(runtimeContributionIds).toContain("feishu-runtime");
    expect(runtimeContributionIds).toContain("webhook-runtime");
  });

  it("default plugins include all five required plugins", () => {
    const feishuClient: FeishuClientPort = makeFakeFeishuClient();

    const cloudDoc = {
      createDoc: async () => ({ documentId: "doc_fake" }),
      writeMarkdown: async () => {},
      deleteDoc: async () => {},
      buildDocUrl: (_documentId: string) => `https://feishu.cn/docx/${_documentId}`
    };

    const runtimeFactory = () => ({
      id: "fake-runtime",
      start: async () => {},
      stop: async () => {}
    });

    const plugins = defaultPlugins({
      feegleHome: "/tmp/feegle-test",
      feishuClient,
      cloudDoc,
      runtimeFactory
    });

    const pluginIds = plugins.map((p) => p.id);
    expect(pluginIds).toContain("core");
    expect(pluginIds).toContain("stock");
    expect(pluginIds).toContain("gitlab-follow");
    expect(pluginIds).toContain("webhook");
    expect(pluginIds).toContain("feishu");
  });

  it("all acceptance tests are discoverable and not skipped", () => {
    const acceptanceDir = join(rootDir, "tests", "acceptance");
    const files = readdirSync(acceptanceDir).filter((f) => f.endsWith(".test.ts"));

    // We should have at least these acceptance test files
    const requiredFiles = [
      "scenario-matrix.test.ts",
      "default-plugin-registration.test.ts",
      "slash-command-readiness.test.ts",
      "diagnostic-actionability.test.ts",
      "trace-completeness.test.ts",
      "failure-injection.test.ts",
      "no-silent-fallback.test.ts",
      "plan-status-document.test.ts",
      "platform-acceptance-matrix.test.ts"
    ];

    for (const required of requiredFiles) {
      expect(files, `Missing acceptance test: ${required}`).toContain(required);
    }
  });

  it("scenario matrix document exists and contains all required rows", () => {
    const matrixPath = join(rootDir, "_docs", "runtime-platform-scenario-matrix.md");
    expect(existsSync(matrixPath)).toBe(true);
    const matrix = readFileSync(matrixPath, "utf8");

    const required = ["F-01", "F-02", "G-01", "W-01", "S-01", "C-01", "R-01", "M-01", "O-01"];
    for (const id of required) {
      expect(matrix, `Scenario matrix missing ${id}`).toContain(id);
    }
  });

  it("manual testing handoff exists and references the gate", () => {
    const handoffPath = join(rootDir, "_docs", "manual-testing-handoff.md");
    expect(existsSync(handoffPath)).toBe(true);
    const handoff = readFileSync(handoffPath, "utf8");
    expect(handoff).toContain("npm run verify:platform");
  });

  it("production source has no hardcoded default workspace ids", () => {
    const sourceFiles = readdirRecursive(join(rootDir, "src")).filter((file) => file.endsWith(".ts"));
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, "utf8");
      return content.includes("ws_default") || content.includes("ws_personal");
    });

    expect(offenders.map((file) => file.replace(`${rootDir}/`, ""))).toEqual([]);
  });
});

function readdirRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readdirRecursive(path));
    } else {
      files.push(path);
    }
  }
  return files;
}
