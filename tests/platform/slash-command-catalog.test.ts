import { describe, expect, it } from "vitest";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";

describe("slash command catalog", () => {
  it("lists CC Connect and Feegle commands in the shared catalog", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const sessionCommands = registry.listCommands("session");

    expect(sessionCommands.map((command) => command.command)).toContain("/new");
    expect(sessionCommands.map((command) => command.command)).toContain("/sessions");
  });

  it("keeps the shared catalog aligned with CC Connect groups without role shortcuts", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const allCommands = registry.listCommands();

    expect(allCommands.map((command) => command.command)).toContain("/repo list");
    expect(allCommands.map((command) => command.command)).not.toContain("/role list");
    expect(allCommands.map((command) => command.command)).not.toContain("/fork <群名> [@用户...]");
  });

  it("matches nested commands before generic roots", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });

    expect(registry.findByInput("/repo scan")?.id).toBe("repo_scan");
    expect(registry.findByInput("/repo show")?.id).toBe("repo_show");
    expect(registry.findByInput("/repo list")?.id).toBe("repo_list");
  });

  it("matches aliases", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });

    expect(registry.findByInput("/bid feature/dev main #1")?.id).toBe("bind");
    expect(registry.findByInput("/repo sync")?.id).toBe("repo_scan");
  });
});
