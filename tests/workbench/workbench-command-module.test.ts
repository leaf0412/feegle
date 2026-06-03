import { describe, expect, it, vi } from "vitest";
import { workbenchCommandModule } from "@features/workbench/workbench-command-module.js";
import { SlashCommandRegistry } from "@platform/slash-command-handler.js";
import type { WorkbenchCardService } from "@features/workbench/workbench-card-service.js";
import type { PlatformCard } from "@platform/platform-card.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";

const stubCard: PlatformCard = {
  header: { title: "工作台", color: "blue" },
  elements: []
};

function buildServiceMock(overrides: Partial<WorkbenchCardService> = {}): WorkbenchCardService {
  return {
    getCard: vi.fn().mockResolvedValue(stubCard),
    handleAction: vi.fn().mockResolvedValue(stubCard),
    ...overrides
  } as unknown as WorkbenchCardService;
}

function buildContext(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_test",
    messageId: "om_test",
    sender: { platform: "feishu", userId: "ou_test" },
    definition: {
      id: "workbench",
      command: "/workbench",
      description: "工作台操作",
      groupKey: "workspace",
      action: "act:/workbench"
    },
    raw: "/workbench",
    args: "",
    ...overrides
  };
}

describe("workbenchCommandModule", () => {
  it("registers a planned handler when service is not available", async () => {
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, { repositories: { list: () => [] } });

    const handler = registry.resolve("workbench");
    expect(handler).toBeDefined();
    const reply = await handler!.execute(buildContext({ args: "discuss hello" }));
    expect(reply.kind).toBe("text");
    expect((reply as { text: string }).text).toContain("规划中");
  });

  it("delegates /workbench discuss to service.handleAction with discuss_requirement", async () => {
    const service = buildServiceMock();
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    const reply = await handler!.execute(buildContext({ args: "discuss hello world" }));

    expect(service.handleAction).toHaveBeenCalledWith("oc_test", "discuss_requirement", "hello world");
    expect(reply.kind).toBe("card");
  });

  it("returns card_update reply when source is card", async () => {
    const service = buildServiceMock();
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    const reply = await handler!.execute(buildContext({
      source: "card",
      args: "discuss hello"
    }));

    expect(reply.kind).toBe("card_update");
  });

  it("maps revise_requirement slug to the right button", async () => {
    const service = buildServiceMock();
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    await handler!.execute(buildContext({ args: "revise_requirement more details" }));

    expect(service.handleAction).toHaveBeenCalledWith("oc_test", "revise_requirement", "more details");
  });

  it("maps generate_plan slug to the right button with no payload", async () => {
    const service = buildServiceMock();
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    await handler!.execute(buildContext({ args: "generate_plan" }));

    expect(service.handleAction).toHaveBeenCalledWith("oc_test", "generate_plan", undefined);
  });

  it("dispatches manage_repos through handleAction", async () => {
    const service = buildServiceMock();
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    const reply = await handler!.execute(buildContext({ args: "manage_repos" }));

    expect(service.handleAction).toHaveBeenCalledWith("oc_test", "manage_repos", undefined);
    expect(reply.kind).not.toBe("text");
  });

  it("returns error text when service throws", async () => {
    const service = buildServiceMock({
      handleAction: vi.fn().mockRejectedValue(new Error("boom"))
    } as unknown as WorkbenchCardService);
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    const reply = await handler!.execute(buildContext({ args: "generate_plan" }));

    expect(reply.kind).toBe("text");
    expect((reply as { text: string }).text).toContain("boom");
  });

  it("returns error text for unknown slug", async () => {
    const service = buildServiceMock();
    const registry = new SlashCommandRegistry();
    workbenchCommandModule().register(registry, {
      repositories: { list: () => [] },
      workbenchCardService: service
    });

    const handler = registry.resolve("workbench");
    const reply = await handler!.execute(buildContext({ args: "foobar" }));

    expect(reply.kind).toBe("text");
    expect((reply as { text: string }).text).toContain("foobar");
    expect(service.handleAction).not.toHaveBeenCalled();
  });
});
