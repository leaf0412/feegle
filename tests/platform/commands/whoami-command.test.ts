import { describe, expect, it } from "vitest";
import { WhoamiCommandHandler } from "@platform/commands/whoami-command.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";
import { defineSlashCommand } from "@platform/slash-command-catalog.js";

const definition = defineSlashCommand("whoami", "/whoami", "查看身份", "system", "cmd:/whoami");

function makeContext(userId: string, email?: string): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sender: { platform: "feishu", userId, email },
    definition,
    raw: "/whoami",
    args: ""
  };
}

describe("WhoamiCommandHandler", () => {
  it("marks the sender as owner when sender.email is in ownerEmails", async () => {
    const handler = new WhoamiCommandHandler({ ownerEmails: new Set(["alice@example.com"]) });
    const reply = await handler.execute(makeContext("ou_owner", "alice@example.com"));
    expect(reply.kind).toBe("text");
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("platform: feishu");
    expect(reply.text).toContain("userId: ou_owner");
    expect(reply.text).toContain("邮箱: alice@example.com");
    expect(reply.text).toContain("isOwner: ✅");
  });

  it("flags a non-owner and tells them to add the email so they can copy it into env", async () => {
    const handler = new WhoamiCommandHandler({ ownerEmails: new Set(["alice@example.com"]) });
    const reply = await handler.execute(makeContext("ou_other", "bob@example.com"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("邮箱: bob@example.com");
    expect(reply.text).toContain("isOwner: ❌");
    expect(reply.text).toContain("ownerEmails");
    expect(reply.text).toContain("bob@example.com");
  });

  it("renders the no-email branch when sender.email is missing", async () => {
    const handler = new WhoamiCommandHandler({ ownerEmails: new Set(["alice@example.com"]) });
    const reply = await handler.execute(makeContext("ou_other"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("邮箱: (未获取到)");
    expect(reply.text).toContain("isOwner: ❌");
    expect(reply.text).toContain("飞书未返回邮箱");
  });

  it("does not crash when ownerEmails is undefined", async () => {
    const handler = new WhoamiCommandHandler();
    const reply = await handler.execute(makeContext("ou_other", "bob@example.com"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("isOwner: ❌");
  });

  it("shows (空) when sender.userId is empty (default fallback path)", async () => {
    const handler = new WhoamiCommandHandler({ ownerEmails: new Set() });
    const reply = await handler.execute(makeContext(""));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("userId: (空)");
  });
});
