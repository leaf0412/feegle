import { describe, expect, it } from "vitest";
import { buildSlashCommandRegistry } from "@platform/build-slash-command-registry.js";
import { runtimeCommandModule } from "@platform/commands/runtime-command-module.js";

describe("slash command readiness", () => {
  it("runtime control commands are implemented when all deps are available", () => {
    // Build the registry with runtime command module and ALL deps present.
    // Using defaults: false to avoid dependencies from other modules.
    const registry = buildSlashCommandRegistry({
      defaults: false,
      modules: [runtimeCommandModule()],
      // Provide all deps needed by the runtime command module
      runtimeInspectionService: {
        inspect: async (_workspaceId: string) => ({
          workspaceId: _workspaceId,
          totalWorkflows: 0,
          failedCount: 0,
          waitingCount: 0,
          runningCount: 0,
          completedCount: 0,
          interruptedCount: 0,
          workflows: []
        })
      } as any,
      controlActionProcessor: {
        process: async (_id: string, _now: string) => ({ status: "completed" as const })
      } as any,
      controlActionStore: {
        create: () => ({} as any),
        getById: () => undefined,
        listPending: () => []
      } as any,
      workflowRuntime: {
        start: async () => ({ status: "succeeded" as const }),
        resume: async () => ({ status: "succeeded" as const })
      } as any,
      memoryService: {
        approve: () => {},
        reject: () => {},
        search: () => []
      } as any,
      repositories: {
        list: () => []
      }
    });

    // Check there are no planned commands (all should be implemented with deps)
    const planned = registry.listCommands().filter((cmd) => !registry.isImplemented(cmd.id));
    expect(planned).toEqual([]);

    // Assert required runtime control commands are present
    const requiredIds = [
      "runtime_list",
      "runtime_show",
      "runtime_approve",
      "runtime_reject",
      "runtime_cancel",
      // runtime_resume is registered as the resume command
      "runtime_resume",
      "runtime_recover",
      "runtime_memory_approve",
      "runtime_memory_reject"
    ];

    for (const id of requiredIds) {
      const def = registry.findById(id);
      expect(def, `command ${id} not found`).toBeDefined();
      expect(registry.isImplemented(id), `command ${id} is planned but not implemented`).toBe(true);
    }
  });
});
