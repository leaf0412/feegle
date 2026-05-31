import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { CommandsCommandHandler } from "@platform/commands/workspace/commands-command.js";
import { CompressCommandHandler } from "@platform/commands/workspace/compress-command.js";
import { ShowCommandHandler } from "@platform/commands/workspace/show-command.js";
import { SkillsCommandHandler } from "@platform/commands/workspace/skills-command.js";
import { StopCommandHandler } from "@platform/commands/workspace/stop-command.js";
import { defineSlashCommand } from "@platform/slash-command-catalog.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";

const def = defineSlashCommand("ws", "/ws", "x", "agent", "cmd:/ws");

function makeContext(args = "", email?: string): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey: "feishu:oc_1:u_1",
    sender: { platform: "feishu", userId: "u_1", email },
    definition: def,
    raw: "/ws",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-ws-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("StopCommandHandler", () => {
  it("explains feegle has no long-running agent so users don't expect /stop to kill anything", async () => {
    const handler = new StopCommandHandler();
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("无需 /stop");
  });
});

describe("ShowCommandHandler", () => {
  it("rejects relative paths so /show ../etc/passwd never resolves through cwd guesses", async () => {
    const handler = new ShowCommandHandler({ ownerEmails: new Set(["a@b.com"]) });
    const reply = await handler.execute(makeContext("./relative.txt", "a@b.com"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("绝对路径");
  });

  it("reads small file and reports path so owners can dump local config easily", async () => {
    const file = join(home, "note.md");
    await writeFile(file, "hello\nworld");
    const handler = new ShowCommandHandler({ ownerEmails: new Set(["a@b.com"]) });
    const reply = await handler.execute(makeContext(file, "a@b.com"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("hello");
    expect(reply.text).toContain("world");
    expect(reply.text).toContain(file);
  });
});

describe("CommandsCommandHandler", () => {
  it("guides users to add commands when directory missing instead of erroring", async () => {
    const handler = new CommandsCommandHandler({ feegleHome: home });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("尚未配置");
  });

  it("lists .md files and uses first heading as description", async () => {
    await mkdir(join(home, "commands"));
    await writeFile(join(home, "commands", "hello.md"), "# Greet the user\n");
    await writeFile(join(home, "commands", "ignore.txt"), "skip");
    const handler = new CommandsCommandHandler({ feegleHome: home });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/hello");
    expect(reply.text).toContain("Greet the user");
    expect(reply.text).not.toContain("ignore");
  });
});

describe("SkillsCommandHandler", () => {
  it("guides users to add SKILL.md when directory missing", async () => {
    const handler = new SkillsCommandHandler({ feegleHome: home });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("尚未配置");
  });

  it("lists skill directories containing SKILL.md and uses heading as description", async () => {
    await mkdir(join(home, "skills", "writer"), { recursive: true });
    await writeFile(join(home, "skills", "writer", "SKILL.md"), "# Prose review\n");
    await mkdir(join(home, "skills", "no-skill-file"), { recursive: true });
    const handler = new SkillsCommandHandler({ feegleHome: home });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("writer");
    expect(reply.text).toContain("Prose review");
    expect(reply.text).not.toContain("no-skill-file");
  });
});

describe("CompressCommandHandler", () => {
  it("tells user no provider so they know to /provider use first", async () => {
    const handler = new CompressCommandHandler({ providers: new AgentProviderRegistry() });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/provider use");
  });

  it("reports unsupported when agent lacks ContextCompressor so users see clean explanation", async () => {
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({}) as never });
    providers.setActive("codex");
    const handler = new CompressCommandHandler({ providers });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("暂不支持");
  });

  it("returns the compressCommand string when agent implements ContextCompressor", async () => {
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "claude_code",
      displayName: "Claude Code",
      buildAgent: () => ({ compressCommand: () => "/compact" }) as never
    });
    providers.setActive("claude_code");
    const handler = new CompressCommandHandler({ providers });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("`/compact`");
  });
});
