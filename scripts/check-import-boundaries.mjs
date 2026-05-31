import { readFileSync, readdirSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const importPattern = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const files = globSync("{src,tests}/**/*.ts", { cwd: root, withFileTypes: false });
const topModules = new Set(["core", "infra", "platform", "plugins", "integrations", "features", "resources", "domain"]);
const violations = [];

// ---- Top-level source folder check ----
for (const entry of readdirSync(new URL("../src", import.meta.url), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!topModules.has(entry.name)) {
    violations.push(`unplanned top-level source folder: src/${entry.name}`);
  }
}

function owningModule(file) {
  const parts = file.split("/");
  if (parts[0] === "tests") return "tests";
  if (parts[0] !== "src") return null;
  // Files directly in src/ (like src/index.ts) have no module owner
  if (parts.length < 3) return null;
  // Files under src/<unknown>/ are an unapproved location
  if (!topModules.has(parts[1])) {
    violations.push(`${file}: file under unapproved top-level module src/${parts[1]}`);
    return null;
  }
  return parts[1];
}

// ---- Cross-boundary relative import check ----
for (const file of files) {
  const owner = owningModule(file);
  const content = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier?.startsWith(".")) continue;

    // Flag any import that reaches back to a different src/ boundary via relative path
    const normalized = relative(root, new URL(specifier, new URL(`../${dirname(file)}/`, import.meta.url)).pathname);
    const targetOwner = owningModule(normalized);
    if (owner && targetOwner && owner !== targetOwner) {
      violations.push(`${file}: cross-boundary relative import '${specifier}' should use alias`);
    }
  }
}

// ---- No relative imports from tests/ that reach into src/ ----
for (const file of files) {
  if (!file.startsWith("tests/")) continue;
  const content = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier?.startsWith(".")) continue;

    const normalized = relative(root, new URL(specifier, new URL(`../${dirname(file)}/`, import.meta.url)).pathname);
    if (normalized.startsWith("src/")) {
      violations.push(`${file}: relative import '${specifier}' reaches into src/; use alias`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
} else {
  console.log("No boundary violations found.");
}
