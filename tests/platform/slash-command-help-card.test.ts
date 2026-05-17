import { describe, expect, it } from "vitest";
import { buildSlashCommandDetailCard, buildSlashCommandHelpCard } from "../../src/platform/slash-command-help-card.js";

describe("slash command help cards", () => {
  it("builds a navigable command group card", () => {
    const card = buildSlashCommandHelpCard("repo");
    const json = JSON.stringify(card);

    expect(card.header?.title).toBe("命令面板 · 仓库");
    expect(json).toContain("nav:/help session");
    expect(json).toContain("nav:/command bind");
    expect(json).toContain("/bind|/bid");
  });

  it("builds a command detail card with back navigation", () => {
    const card = buildSlashCommandDetailCard("repo_list");
    const json = JSON.stringify(card);

    expect(card.header?.title).toBe("/repo list");
    expect(json).toContain("Feegle 计划新增");
    expect(json).toContain("nav:/help repo");
  });
});
