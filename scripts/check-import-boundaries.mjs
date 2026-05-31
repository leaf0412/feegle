import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const importPattern = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const files = globSync("{src,tests}/**/*.ts", { cwd: root, withFileTypes: false });
const topModules = new Set(["core", "infra", "platform", "plugins", "integrations", "features", "resources", "domain"]);
const violations = [];

function owningModule(file) {
  const parts = file.split("/");
  if (parts[0] === "tests") return "tests";
  if (parts[0] !== "src") return null;
  return topModules.has(parts[1]) ? parts[1] : null;
}

for (const file of files) {
  const owner = owningModule(file);
  const content = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier?.startsWith(".")) continue;

    const normalized = relative(root, new URL(specifier, new URL(`../${dirname(file)}/`, import.meta.url)).pathname);
    const targetOwner = owningModule(normalized);
    if (owner && targetOwner && owner !== targetOwner) {
      violations.push(`${file}: cross-boundary relative import '${specifier}' should use alias`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
} else {
  console.log("No boundary violations found.");
}
