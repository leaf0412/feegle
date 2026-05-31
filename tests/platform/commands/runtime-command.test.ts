import { describe, expect, it, vi } from "vitest";
import { buildSlashCommandRegistry } from "../../../src/platform/build-slash-command-registry.js";
import type { SlashCommandDefinition } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandHandler, SlashCommandReply } from "../../../src/platform/slash-command-handler.js";
import { stubSchedulerSlashDeps } from "../../fixtures/scheduler-deps.js";
import { runtimeCommandModule } from "../../../src/platform/commands/runtime-command-module.js";

function fakeInspectionService(workflows: Array<{
  id: string;
  status: string;
  currentStepId: string | null;
  definitionId: string | null;
}>) {
  return {
    inspect: async () => ({
      workflows,
      totalWorkflows: workflows.length,
      waitingCount: workflows.filter((w) => w.status === "waiting").length,
      failedCount: workflows.filter((w) => w.status === "failed").length,
    }),
  };
}

function fakeControlActionStore() {
  const actions: Record<string, any> = {};
  return {
    create: vi.fn((input: any) => {
      const record = { ...input, status: "pending", errorMessage: null, createdAt: input.now, updatedAt: input.now };
      actions[input.id] = record;
      return record;
    }),
    getById: (id: string) => actions[id],
    listPending: () => [],
  };
}

describe("runtime command module", () => {
  const controlActionStore = fakeControlActionStore();
  const registry = buildSlashCommandRegistry({
    ...stubSchedulerSlashDeps({
      controlActionProcessor: {
        process: async () => ({ status: "completed" as const }),
      } as any,
      workflowRuntime: {
        resume: async () => ({ status: "resumed" }),
      } as any,
      runtimeInspectionService: fakeInspectionService([
        { id: "wf_1", status: "waiting", currentStepId: "approve", definitionId: "demo.workflow" },
      ]) as any,
      controlActionStore: controlActionStore as any,
      memoryService: {
        approve: vi.fn(),
        reject: vi.fn(),
      } as any,
    }),
    defaults: false,
    modules: [runtimeCommandModule()],
  });

  function makeContext(id: string, raw: string, args: string): any {
    return {
      source: "message",
      chatId: "oc_1",
      messageId: "om_1",
      sender: { platform: "feishu", userId: "ou_1" },
      definition: registry.findById(id)!,
      raw,
      args,
    };
  }

  it("registers expected runtime command ids", () => {
    const systemCommands = registry.listCommands("system");
    const ids = systemCommands.map((cmd) => cmd.id).sort();
    expect(ids).toContain("runtime_list");
    expect(ids).toContain("runtime_show");
    expect(ids).toContain("runtime_approve");
    expect(ids).toContain("runtime_reject");
    expect(ids).toContain("runtime_cancel");
    expect(ids).toContain("runtime_resume");
    expect(ids).toContain("runtime_memory_approve");
    expect(ids).toContain("runtime_memory_reject");
    expect(ids).toContain("runtime_recover");
  });

  describe("list", () => {
    it("lists workflows with status", async () => {
      const handler = registry.resolve("runtime_list");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext("runtime_list", "/runtime list", ""));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("wf_1");
      expect(reply.text).toContain("waiting");
      expect(reply.text).toContain("demo.workflow");
      expect(reply.text).toContain("等待 approve");
    });

    it("shows empty message when no workflows", async () => {
      const emptyReg = buildSlashCommandRegistry({
        ...stubSchedulerSlashDeps({
          runtimeInspectionService: fakeInspectionService([]) as any,
        }),
        defaults: false,
        modules: [runtimeCommandModule()],
      });
      const handler = emptyReg.resolve("runtime_list");
      const def = emptyReg.findById("runtime_list")!;
      const reply = await handler!.execute({
        source: "message",
        chatId: "oc_1",
        messageId: "om_1",
        sender: { platform: "feishu", userId: "ou_1" },
        definition: def,
        raw: "/runtime list",
        args: "",
      });
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("暂无工作流");
    });
  });

  describe("show", () => {
    it("shows detailed status for a workflow", async () => {
      const handler = registry.resolve("runtime_show");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext("runtime_show", "/runtime show wf_1", "wf_1"));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("wf_1");
      expect(reply.text).toContain("waiting");
      expect(reply.text).toContain("approve");
    });

    it("returns usage when no id provided", async () => {
      const handler = registry.resolve("runtime_show");
      const reply = await handler!.execute(makeContext("runtime_show", "/runtime show", ""));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });

    it("returns not found for unknown id", async () => {
      const handler = registry.resolve("runtime_show");
      const reply = await handler!.execute(makeContext("runtime_show", "/runtime show nonexistent", "nonexistent"));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("未找到");
    });
  });

  describe("approve", () => {
    it("processes an action", async () => {
      const handler = registry.resolve("runtime_approve");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext("runtime_approve", "/runtime approve ca_1", "ca_1"));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("ca_1");
      expect(reply.text).toContain("批准");
    });

    it("shows usage when no id provided", async () => {
      const handler = registry.resolve("runtime_approve");
      const reply = await handler!.execute(makeContext("runtime_approve", "/runtime approve", ""));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });

    it("surfaces failure text when processor fails", async () => {
      const failReg = buildSlashCommandRegistry({
        ...stubSchedulerSlashDeps({
          controlActionProcessor: {
            process: async () => ({ status: "failed" as const, error: { message: "bad" } }),
          } as any,
        }),
        defaults: false,
        modules: [runtimeCommandModule()],
      });
      const handler = failReg.resolve("runtime_approve");
      const def = failReg.findById("runtime_approve")!;
      const reply = await handler!.execute({
        source: "message",
        chatId: "oc_1",
        messageId: "om_1",
        sender: { platform: "feishu", userId: "ou_1" },
        definition: def,
        raw: "/runtime approve ca_1",
        args: "ca_1",
      });
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("失败");
      expect(reply.text).toContain("bad");
    });
  });

  describe("reject", () => {
    it("processes an action via processor", async () => {
      const handler = registry.resolve("runtime_reject");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext("runtime_reject", "/runtime reject ca_1", "ca_1"));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("ca_1");
      expect(reply.text).toContain("拒绝");
    });

    it("shows usage when no id provided", async () => {
      const handler = registry.resolve("runtime_reject");
      const reply = await handler!.execute(makeContext("runtime_reject", "/runtime reject", ""));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });

    it("surfaces failure text when processor fails", async () => {
      const failReg = buildSlashCommandRegistry({
        ...stubSchedulerSlashDeps({
          controlActionProcessor: {
            process: async () => ({ status: "failed" as const, error: { message: "reject failed" } }),
          } as any,
        }),
        defaults: false,
        modules: [runtimeCommandModule()],
      });
      const handler = failReg.resolve("runtime_reject");
      const def = failReg.findById("runtime_reject")!;
      const reply = await handler!.execute({
        source: "message",
        chatId: "oc_1",
        messageId: "om_1",
        sender: { platform: "feishu", userId: "ou_1" },
        definition: def,
        raw: "/runtime reject ca_1",
        args: "ca_1",
      });
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("失败");
      expect(reply.text).toContain("reject failed");
    });
  });

  describe("cancel", () => {
    it("creates a control action and processes it", async () => {
      const handler = registry.resolve("runtime_cancel");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext("runtime_cancel", "/runtime cancel wf_1", "wf_1"));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("已取消");
      expect(controlActionStore.create).toHaveBeenCalled();
    });

    it("shows usage when no id provided", async () => {
      const handler = registry.resolve("runtime_cancel");
      const reply = await handler!.execute(makeContext("runtime_cancel", "/runtime cancel", ""));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });
  });

  describe("resume", () => {
    it("registers handler", () => {
      expect(registry.resolve("runtime_resume")).toBeDefined();
    });
  });

  describe("memory approve", () => {
    it("approves a memory candidate", async () => {
      const handler = registry.resolve("runtime_memory_approve");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext(
        "runtime_memory_approve",
        "/runtime memory approve mem_1",
        "mem_1"
      ));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("mem_1");
      expect(reply.text).toContain("已批准");
    });

    it("shows usage when no id provided", async () => {
      const handler = registry.resolve("runtime_memory_approve");
      const reply = await handler!.execute(makeContext(
        "runtime_memory_approve",
        "/runtime memory approve",
        ""
      ));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });
  });

  describe("memory reject", () => {
    it("rejects a memory candidate", async () => {
      const handler = registry.resolve("runtime_memory_reject");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext(
        "runtime_memory_reject",
        "/runtime memory reject mem_1",
        "mem_1"
      ));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("mem_1");
      expect(reply.text).toContain("已拒绝");
    });

    it("shows usage when no id provided", async () => {
      const handler = registry.resolve("runtime_memory_reject");
      const reply = await handler!.execute(makeContext(
        "runtime_memory_reject",
        "/runtime memory reject",
        ""
      ));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });
  });

  describe("recover", () => {
    it("creates a recovery control action", async () => {
      const handler = registry.resolve("runtime_recover");
      expect(handler).toBeDefined();
      const reply = await handler!.execute(makeContext(
        "runtime_recover",
        "/runtime recover wf_1",
        "wf_1"
      ));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("恢复请求已创建");
    });

    it("shows usage when no id provided", async () => {
      const handler = registry.resolve("runtime_recover");
      const reply = await handler!.execute(makeContext(
        "runtime_recover",
        "/runtime recover",
        ""
      ));
      if (reply.kind !== "text") throw new Error("expected text");
      expect(reply.text).toContain("用法");
    });
  });
});
