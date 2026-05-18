import { describe, expect, it } from "vitest";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";
import type { SlashCommandHandler, SlashCommandReply } from "../../src/platform/slash-command-handler.js";

describe("buildSlashCommandRegistry", () => {
  it("lets external command modules register handlers without editing the builder", async () => {
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
            target.register(handler);
          }
        }
      ]
    });

    await expect(
      registry.resolve("sample_external")?.execute({
        source: "message",
        chatId: "oc_1",
        messageId: "om_1",
        sender: { platform: "feishu", userId: "ou_1" },
        definition: {
          id: "sample_external",
          command: "/sample_external",
          description: "sample",
          groupKey: "system",
          action: "cmd:/sample_external"
        },
        raw: "/sample_external",
        args: ""
      })
    ).resolves.toEqual({ kind: "text", text: "external module reply" });
  });
});
