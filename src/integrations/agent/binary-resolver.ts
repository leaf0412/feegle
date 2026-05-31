import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";

export function resolveBinary(name: string): string {
  if (name.includes("/")) {
    return resolveByPath(name);
  }
  return resolveByWhich(name);
}

function resolveByPath(filePath: string): string {
  try {
    accessSync(filePath, constants.X_OK);
    return filePath;
  } catch {
    throw new Error(
      `agent binary not found or not executable: ${filePath}`
    );
  }
}

function resolveByWhich(name: string): string {
  try {
    const resolved = execFileSync("which", [name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    if (!resolved) {
      throw new Error(`"which ${name}" returned empty`);
    }
    return resolved;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('"which')) {
      throw error;
    }
    throw new Error(
      `agent binary "${name}" not found on PATH. Install it or set "command" in agent provider config to the full binary path.`
    );
  }
}
