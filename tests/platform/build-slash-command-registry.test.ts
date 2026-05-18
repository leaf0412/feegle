import { describe, expect, it } from "vitest";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";
import type { SlashCommandDefinition } from "../../src/platform/slash-command-catalog.js";
import type { SlashCommandHandler, SlashCommandReply } from "../../src/platform/slash-command-handler.js";

describe("buildSlashCommandRegistry", () => {
  it("lets external command modules register handlers without editing the builder", async () => {
    const definition: SlashCommandDefinition = {
      id: "sample_external",
      command: "/sample",
      description: "sample",
      groupKey: "system",
      action: "cmd:/sample",
      aliases: ["/sample-alias"]
    };
    const handler: SlashCommandHandler = {
      id: "sample_external",
      async execute(): Promise<SlashCommandReply> {
        return { kind: "text", text: "external module reply" };
      }
    };

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      modules: [
        {
          id: "external",
          register: (target) => {
            target.register(definition, handler);
          }
        }
      ]
    });

    expect(registry.findByInput("/sample hello")?.id).toBe("sample_external");
    expect(registry.findByInput("/sample-alias hello")?.id).toBe("sample_external");
    expect(registry.listCommands("system").map((command) => command.id)).toContain("sample_external");
    await expect(
      registry.resolve("sample_external")?.execute({
        source: "message",
        chatId: "oc_1",
        messageId: "om_1",
        sender: { platform: "feishu", userId: "ou_1" },
        definition,
        raw: "/sample_external",
        args: ""
      })
    ).resolves.toEqual({ kind: "text", text: "external module reply" });
  });
});
