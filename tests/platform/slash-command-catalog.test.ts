import { describe, expect, it } from "vitest";
import { buildSlashCommandRegistry } from "@platform/build-slash-command-registry.js";
import { stubSchedulerSlashDeps } from "../fixtures/scheduler-deps.js";

describe("slash command catalog", () => {
  it("lists CC Connect and Feegle commands in the shared catalog", () => {
    const registry = buildSlashCommandRegistry(stubSchedulerSlashDeps());
    const sessionCommands = registry.listCommands("session");

    expect(sessionCommands.map((command) => command.command)).toContain("/new");
    expect(sessionCommands.map((command) => command.command)).toContain("/list");
    expect(sessionCommands.map((command) => command.command)).toContain("/stop");
  });

  it("keeps the shared catalog aligned with CC Connect groups without role shortcuts", () => {
    const registry = buildSlashCommandRegistry(stubSchedulerSlashDeps());
    const allCommands = registry.listCommands();

    expect(allCommands.map((command) => command.command)).toContain("/repo list");
    expect(allCommands.map((command) => command.command)).not.toContain("/role list");
    expect(allCommands.map((command) => command.command)).not.toContain("/fork <群名> [@用户...]");
  });

  it("matches nested commands before generic roots", () => {
    const registry = buildSlashCommandRegistry(stubSchedulerSlashDeps());

    expect(registry.findByInput("/repo scan")?.id).toBe("repo_scan");
    expect(registry.findByInput("/repo show")?.id).toBe("repo_show");
    expect(registry.findByInput("/repo list")?.id).toBe("repo_list");
  });

  it("matches aliases", () => {
    const registry = buildSlashCommandRegistry(stubSchedulerSlashDeps());

    expect(registry.findByInput("/bid https://x/repo")?.id).toBe("bind_repo");
    expect(registry.findByInput("/repo sync")?.id).toBe("repo_scan");
  });
});
