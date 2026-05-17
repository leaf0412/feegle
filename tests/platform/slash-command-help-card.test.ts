import { describe, expect, it } from "vitest";
import { buildSlashCommandDetailCard, buildSlashCommandHelpCard } from "../../src/platform/slash-command-help-card.js";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";

describe("slash command help cards", () => {
  it("renders a markdown command table per group with status icons", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const card = buildSlashCommandHelpCard(registry, "repo");
    const json = JSON.stringify(card);

    expect(card.header?.title).toBe("命令面板 · 仓库");
    expect(json).toContain("nav:/help session");
    expect(json).toContain("nav:/help all");
    expect(json).toContain("✅");
    expect(json).toContain("⚙️");
    expect(json).toContain("/repo list");
    expect(json).toContain("nav:/command bind");
  });

  it("falls back to default group when an unknown key is requested", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const card = buildSlashCommandHelpCard(registry, "missing");
    expect(card.header?.title).toBe("命令面板 · 会话");
  });

  it("supports the synthetic 'all' group that lists every command", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const card = buildSlashCommandHelpCard(registry, "all");
    const json = JSON.stringify(card);
    expect(card.header?.title).toBe("命令面板 · 全部");
    expect(json).toContain("分组");
    expect(json).toContain("/new");
    expect(json).toContain("/help");
  });

  it("renders an implemented command detail card with implementation status", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const card = buildSlashCommandDetailCard("repo_list", registry);
    const json = JSON.stringify(card);
    expect(card.header?.title).toBe("/repo list");
    expect(json).toContain("已实现");
    expect(json).toContain("nav:/help repo");
  });

  it("flags planned commands as ⚙️ in the detail card", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const card = buildSlashCommandDetailCard("repo_show", registry);
    const json = JSON.stringify(card);
    expect(json).toContain("规划中");
  });

  it("returns a fallback card when the command id is unknown", () => {
    const registry = buildSlashCommandRegistry({ repositories: { list: () => [] } });
    const card = buildSlashCommandDetailCard("does_not_exist", registry);
    expect(card.header?.title).toBe("命令不存在");
  });
});
