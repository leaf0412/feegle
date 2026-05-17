import { describe, expect, it } from "vitest";
import {
  SlashCommandRegistry,
  type SlashCommandHandler,
  type SlashCommandReply
} from "../../src/platform/slash-command-handler.js";

const stubHandler = (id: string, aliases?: string[]): SlashCommandHandler => ({
  id,
  aliases,
  async execute(): Promise<SlashCommandReply> {
    return { kind: "text", text: id };
  }
});

describe("SlashCommandRegistry", () => {
  it("registers a handler under its canonical id and aliases", () => {
    const registry = new SlashCommandRegistry();
    registry.register(stubHandler("help"));
    expect(registry.resolve("help")?.id).toBe("help");
    expect(registry.isImplemented("help")).toBe(true);
  });

  it("returns undefined for unregistered ids", () => {
    const registry = new SlashCommandRegistry();
    expect(registry.resolve("missing")).toBeUndefined();
    expect(registry.isImplemented("missing")).toBe(false);
  });

  it("dispatches via aliases without reporting them as canonical implementations", () => {
    const registry = new SlashCommandRegistry();
    registry.register(stubHandler("bind", ["bid"]));
    expect(registry.resolve("bid")?.id).toBe("bind");
    expect(registry.isImplemented("bind")).toBe(true);
    expect(registry.isImplemented("bid")).toBe(false);
  });

  it("rejects duplicate registrations to surface programming mistakes", () => {
    const registry = new SlashCommandRegistry();
    registry.register(stubHandler("help"));
    expect(() => registry.register(stubHandler("help"))).toThrow(/already registered/);
  });

  it("rejects alias collisions across handlers", () => {
    const registry = new SlashCommandRegistry();
    registry.register(stubHandler("bind", ["bid"]));
    expect(() => registry.register(stubHandler("other", ["bid"]))).toThrow(/alias collision/);
  });
});
