import { describe, expect, it } from "vitest";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";
import type { SlashCommandDefinition } from "../../src/platform/slash-command-catalog.js";
import type { SlashCommandHandler, SlashCommandReply } from "../../src/platform/slash-command-handler.js";
import { stubSchedulerSlashDeps } from "../fixtures/scheduler-deps.js";

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
      defaults: false,
      modules: [
        {
          id: "external",
          register: (target) => {
            target.registerCommand(definition, handler);
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

  it("freezes the returned registry so runtime cannot add commands after boot", () => {
    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false
    });
    expect(() =>
      registry.registerInternalHandler({
        id: "late",
        async execute() {
          return { kind: "text", text: "late" };
        }
      })
    ).toThrow(/frozen/);
  });

  it("surfaces planned-only definitions through listCommands and findByInput so help can show 规划中", () => {
    const plannedDef: SlashCommandDefinition = {
      id: "external_planned",
      command: "/external_planned",
      description: "external planned",
      groupKey: "system",
      action: "cmd:/external_planned"
    };

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [
        {
          id: "external",
          register: (target) => target.declarePlanned(plannedDef)
        }
      ]
    });

    expect(registry.findByInput("/external_planned")?.id).toBe("external_planned");
    expect(registry.listCommands("system").map((c) => c.id)).toContain("external_planned");
    expect(registry.isImplemented("external_planned")).toBe(false);
    expect(registry.resolve("external_planned")).toBeUndefined();
  });

  it("rejects duplicate ids across modules so two modules cannot silently shadow each other", () => {
    const sharedDef: SlashCommandDefinition = {
      id: "duplicate_id",
      command: "/duplicate_id",
      description: "dup",
      groupKey: "system",
      action: "cmd:/duplicate_id"
    };

    expect(() =>
      buildSlashCommandRegistry({
        repositories: { list: () => [] },
        defaults: false,
        modules: [
          { id: "first", register: (target) => target.declarePlanned(sharedDef) },
          { id: "second", register: (target) => target.declarePlanned(sharedDef) }
        ]
      })
    ).toThrow(/already registered/);
  });

  it("rejects alias collisions across modules so reachability stays deterministic", () => {
    const left: SlashCommandHandler = {
      id: "left",
      aliases: ["shared_alias"],
      async execute(): Promise<SlashCommandReply> {
        return { kind: "text", text: "left" };
      }
    };
    const right: SlashCommandHandler = {
      id: "right",
      aliases: ["shared_alias"],
      async execute(): Promise<SlashCommandReply> {
        return { kind: "text", text: "right" };
      }
    };
    const leftDef: SlashCommandDefinition = {
      id: "left",
      command: "/left",
      description: "left",
      groupKey: "system",
      action: "cmd:/left",
      aliases: ["shared_alias"]
    };
    const rightDef: SlashCommandDefinition = {
      id: "right",
      command: "/right",
      description: "right",
      groupKey: "system",
      action: "cmd:/right",
      aliases: ["shared_alias"]
    };

    expect(() =>
      buildSlashCommandRegistry({
        repositories: { list: () => [] },
        defaults: false,
        modules: [
          { id: "left", register: (target) => target.registerCommand(leftDef, left) },
          { id: "right", register: (target) => target.registerCommand(rightDef, right) }
        ]
      })
    ).toThrow(/alias collision/);
  });

  it("registers default modules before external ones so external collisions fail loudly against defaults", () => {
    const collidingDef: SlashCommandDefinition = {
      id: "help",
      command: "/help",
      description: "shadowed help",
      groupKey: "system",
      action: "cmd:/help"
    };

    expect(() =>
      buildSlashCommandRegistry({
        ...stubSchedulerSlashDeps(),
        modules: [
          { id: "shadow", register: (target) => target.declarePlanned(collidingDef) }
        ]
      })
    ).toThrow(/already registered/);
  });
});
