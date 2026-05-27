import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * The single global directory where general chats run (search / temp code / discussion).
 * Project development clones go through the GitLab flow (config.gitlab.workspace), not here.
 * Defaults to <feegleHome>/workspace; overridable via config.jsonc `defaultWorkspace`.
 */
export function resolveWorkspaceDir(feegleHome: string, configured: string | undefined): string {
  const dir = configured?.trim() ? resolve(configured) : join(feegleHome, "workspace");
  mkdirSync(dir, { recursive: true });
  return dir;
}
