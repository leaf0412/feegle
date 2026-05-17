import { describe, expect, it } from "vitest";
import { findSlashCommandByInput, listSlashCommands } from "../../src/platform/slash-command-catalog.js";

describe("slash command catalog", () => {
  it("lists CC Connect and Feegle commands in the shared catalog", () => {
    const sessionCommands = listSlashCommands("session");

    expect(sessionCommands.map((command) => command.command)).toContain("/new");
    expect(sessionCommands.map((command) => command.command)).toContain("/sessions");
  });

  it("keeps the shared catalog aligned with CC Connect groups without role shortcuts", () => {
    const allCommands = listSlashCommands();

    expect(allCommands.map((command) => command.command)).toContain("/repo list");
    expect(allCommands.map((command) => command.command)).not.toContain("/role list");
    expect(allCommands.map((command) => command.command)).not.toContain("/fork <群名> [@用户...]");
  });

  it("matches nested commands before generic roots", () => {
    expect(findSlashCommandByInput("/repo scan")?.id).toBe("repo_scan");
    expect(findSlashCommandByInput("/repo show")?.id).toBe("repo_show");
    expect(findSlashCommandByInput("/repo list")?.id).toBe("repo_list");
  });

  it("matches aliases", () => {
    expect(findSlashCommandByInput("/bid feature/dev main #1")?.id).toBe("bind");
    expect(findSlashCommandByInput("/repo sync")?.id).toBe("repo_scan");
  });
});
