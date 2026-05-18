import { describe, expect, it } from "vitest";
import {
  SlashCommandRegistry,
  type SlashCommandHandler,
  type SlashCommandReply
} from "../../src/platform/slash-command-handler.js";
import { defineSlashCommand } from "../../src/platform/slash-command-catalog.js";

const stubHandler = (id: string, aliases?: string[]): SlashCommandHandler => ({
  id,
  aliases,
  async execute(): Promise<SlashCommandReply> {
    return { kind: "text", text: id };
  }
});

const def = (id: string, aliases?: string[]) =>
  defineSlashCommand(id, `/${id}`, id, "system", `cmd:/${id}`, aliases);

describe("SlashCommandRegistry", () => {
  it("declarePlanned exposes a definition without a handler so help can show 规划中", () => {
    const registry = new SlashCommandRegistry();
    registry.declarePlanned(def("note_find"));
    expect(registry.findById("note_find")?.id).toBe("note_find");
    expect(registry.isImplemented("note_find")).toBe(false);
    expect(registry.resolve("note_find")).toBeUndefined();
  });

  it("registerCommand pairs a definition and its handler in one atomic call", () => {
    const registry = new SlashCommandRegistry();
    registry.registerCommand(def("help"), stubHandler("help"));
    expect(registry.resolve("help")?.id).toBe("help");
    expect(registry.isImplemented("help")).toBe(true);
    expect(registry.findById("help")?.id).toBe("help");
  });

  it("registerInternalHandler attaches a handler with no public definition for button callbacks", () => {
    const registry = new SlashCommandRegistry();
    registry.registerInternalHandler(stubHandler("__command_detail"));
    expect(registry.resolve("__command_detail")?.id).toBe("__command_detail");
    expect(registry.findById("__command_detail")).toBeUndefined();
    expect(registry.isImplemented("__command_detail")).toBe(true);
  });

  it("returns undefined for unregistered ids so callers can treat absence as a real signal", () => {
    const registry = new SlashCommandRegistry();
    expect(registry.resolve("missing")).toBeUndefined();
    expect(registry.isImplemented("missing")).toBe(false);
  });

  it("dispatches via aliases without reporting them as canonical implementations", () => {
    const registry = new SlashCommandRegistry();
    registry.registerCommand(def("bind", ["bid"]), stubHandler("bind", ["bid"]));
    expect(registry.resolve("bid")?.id).toBe("bind");
    expect(registry.isImplemented("bind")).toBe(true);
    expect(registry.isImplemented("bid")).toBe(false);
  });

  it("rejects duplicate id across any verb so accidental shadowing surfaces at boot", () => {
    const registry = new SlashCommandRegistry();
    registry.registerCommand(def("help"), stubHandler("help"));
    expect(() => registry.registerCommand(def("help"), stubHandler("help"))).toThrow(/already registered/);
    expect(() => registry.declarePlanned(def("help"))).toThrow(/already registered/);
    expect(() => registry.registerInternalHandler(stubHandler("help"))).toThrow(/already registered/);
  });

  it("rejects upgrading a planned definition to implemented because that path hid wiring bugs", () => {
    const registry = new SlashCommandRegistry();
    registry.declarePlanned(def("cron_list"));
    expect(() => registry.registerCommand(def("cron_list"), stubHandler("cron_list"))).toThrow(/already registered/);
  });

  it("rejects alias collisions across handlers so reachability stays unambiguous", () => {
    const registry = new SlashCommandRegistry();
    registry.registerCommand(def("bind", ["bid"]), stubHandler("bind", ["bid"]));
    expect(() => registry.registerCommand(def("other", ["bid"]), stubHandler("other", ["bid"]))).toThrow(/alias collision/);
  });
});
