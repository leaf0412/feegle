import { describe, expect, it } from "vitest";
import { WhoamiCommandHandler } from "../../../src/platform/commands/whoami-command.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";

const definition = defineSlashCommand("whoami", "/whoami", "查看身份", "system", "cmd:/whoami");

function makeContext(userId: string): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sender: { platform: "feishu", userId },
    definition,
    raw: "/whoami",
    args: ""
  };
}

describe("WhoamiCommandHandler", () => {
  it("marks the sender as owner when the match key is in ownerIdentities", async () => {
    const handler = new WhoamiCommandHandler({ ownerIdentities: new Set(["feishu:ou_owner"]) });
    const reply = await handler.execute(makeContext("ou_owner"));
    expect(reply.kind).toBe("text");
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("platform: feishu");
    expect(reply.text).toContain("userId: ou_owner");
    expect(reply.text).toContain("当前 owner 匹配键: feishu:ou_owner");
    expect(reply.text).toContain("isOwner: ✅");
  });

  it("flags a non-owner with the matching key so the user can copy it into env", async () => {
    const handler = new WhoamiCommandHandler({ ownerIdentities: new Set(["feishu:ou_owner"]) });
    const reply = await handler.execute(makeContext("ou_other"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("当前 owner 匹配键: feishu:ou_other");
    expect(reply.text).toContain("isOwner: ❌");
    expect(reply.text).toContain("FEEGLE_OWNER_IDENTITIES");
  });

  it("does not crash when ownerIdentities is undefined", async () => {
    const handler = new WhoamiCommandHandler();
    const reply = await handler.execute(makeContext("ou_other"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("isOwner: ❌");
  });

  it("shows (空) when sender.userId is empty (default fallback path)", async () => {
    const handler = new WhoamiCommandHandler({ ownerIdentities: new Set() });
    const reply = await handler.execute(makeContext(""));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("userId: (空)");
  });
});
