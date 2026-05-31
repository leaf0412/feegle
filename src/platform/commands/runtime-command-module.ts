import type { SlashCommandContext, SlashCommandHandler, SlashCommandReply } from "../slash-command-handler.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import type { ControlActionProcessor } from "@core/control/control-action-processor.js";
import type { ControlActionStore } from "@core/control/control-action-store.js";
import type { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";
import type { MemoryService } from "@core/memory/memory-service.js";
import type { RuntimeInspectionService } from "@core/operations/runtime-inspection-service.js";

const listDefinition = defineSlashCommand(
  "runtime_list",
  "/runtime list",
  "列出工作流实例",
  "system",
  "cmd:/runtime_list"
);

const showDefinition = defineSlashCommand(
  "runtime_show",
  "/runtime show",
  "查看工作流实例详情",
  "system",
  "cmd:/runtime_show"
);

const approveDefinition = defineSlashCommand(
  "runtime_approve",
  "/runtime approve",
  "批准待处理的控制动作",
  "system",
  "cmd:/runtime_approve"
);

const rejectDefinition = defineSlashCommand(
  "runtime_reject",
  "/runtime reject",
  "拒绝待处理的控制动作",
  "system",
  "cmd:/runtime_reject"
);

const resumeDefinition = defineSlashCommand(
  "runtime_resume",
  "/runtime resume",
  "恢复等待中的工作流",
  "system",
  "cmd:/runtime_resume"
);

const cancelDefinition = defineSlashCommand(
  "runtime_cancel",
  "/runtime cancel",
  "取消工作流",
  "system",
  "cmd:/runtime_cancel"
);

const memoryApproveDefinition = defineSlashCommand(
  "runtime_memory_approve",
  "/runtime memory approve",
  "批准记忆候选",
  "system",
  "cmd:/runtime_memory_approve"
);

const memoryRejectDefinition = defineSlashCommand(
  "runtime_memory_reject",
  "/runtime memory reject",
  "拒绝记忆候选",
  "system",
  "cmd:/runtime_memory_reject"
);

const recoverDefinition = defineSlashCommand(
  "runtime_recover",
  "/runtime recover",
  "触发工作流恢复",
  "system",
  "cmd:/runtime_recover"
);

class ListCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_list";
  constructor(
    private readonly inspection: RuntimeInspectionService,
    private readonly operatorWorkspaceId: string
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const workspaceId = context.args.trim() || this.operatorWorkspaceId;
    const result = await this.inspection.inspect(workspaceId);
    if (result.totalWorkflows === 0) {
      return { kind: "text" as const, text: "暂无工作流。" };
    }
    const statusLabel: Record<string, string> = {
      waiting: "等待 approve",
      running: "运行中",
      completed: "已完成",
      failed: "失败",
      interrupted: "中断",
    };
    const lines = result.workflows.map((w) => {
      const label = statusLabel[w.status] ?? w.status;
      const def = w.definitionId ?? "?";
      return `• ${w.id} [${w.status}] ${def} — ${label}`;
    });
    return {
      kind: "text" as const,
      text: `工作流 (${result.totalWorkflows}):\n${lines.join("\n")}`,
    };
  }
}

class ShowCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_show";
  constructor(
    private readonly inspection: RuntimeInspectionService,
    private readonly operatorWorkspaceId: string
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime show <workflowInstanceId>" };

    const result = await this.inspection.inspect(this.operatorWorkspaceId);
    const wf = result.workflows.find((w) => w.id === id);
    if (!wf) return { kind: "text" as const, text: `工作流 ${id} 未找到。` };

    const statusLabel: Record<string, string> = {
      waiting: "等待 approve",
      running: "运行中",
      completed: "已完成",
      failed: "失败",
      interrupted: "中断",
    };
    const label = statusLabel[wf.status] ?? wf.status;
    return {
      kind: "text" as const,
      text: `工作流 ${wf.id}\n状态: ${wf.status} (${label})\n当前步骤: ${wf.currentStepId ?? "无"}\n定义: ${wf.definitionId ?? "?"}`,
    };
  }
}

class ApproveCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_approve";
  constructor(private readonly processor: ControlActionProcessor) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime approve <actionId>" };

    const result = await this.processor.process(id, new Date().toISOString());
    return { kind: "text" as const, text: result.status === "completed" ? `动作 ${id} 已批准。` : `动作 ${id} 失败: ${result.error?.message ?? "未知错误"}` };
  }
}

class RejectCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_reject";
  constructor(private readonly processor: ControlActionProcessor) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime reject <actionId>" };
    const result = await this.processor.process(id, new Date().toISOString());
    return { kind: "text" as const, text: result.status === "completed" ? `动作 ${id} 已拒绝。` : `动作 ${id} 失败: ${result.error?.message ?? "未知错误"}` };
  }
}

class CancelCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_cancel";
  constructor(
    private readonly store: ControlActionStore,
    private readonly processor: ControlActionProcessor,
    private readonly operatorWorkspaceId: string
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime cancel <workflowInstanceId>" };

    const now = new Date().toISOString();
    const actionId = `ca_cancel_${Date.now()}`;
    this.store.create({
      id: actionId,
      workspaceId: this.operatorWorkspaceId,
      actorUserId: context.sender.userId,
      actionType: "cancel_workflow",
      payload: { workflowInstanceId: id },
      now,
    });
    const result = await this.processor.process(actionId, now);
    return { kind: "text" as const, text: result.status === "completed" ? `工作流 ${id} 已取消。` : `取消工作流 ${id} 失败: ${result.error?.message ?? "未知错误"}` };
  }
}

class ResumeCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_resume";
  constructor(
    private readonly wfRuntime: WorkflowRuntime,
    private readonly operatorWorkspaceId: string
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime resume <workflowInstanceId>" };

    const result = await this.wfRuntime.resume({
      workflowInstanceId: id,
      runAttemptId: `cli_resume_${Date.now()}`,
      signal: { signalId: `cli_${Date.now()}`, kind: "control_action", payload: { action: "resume" } },
      workspaceId: this.operatorWorkspaceId,
      now: new Date().toISOString()
    });

    return { kind: "text" as const, text: `工作流 ${id} 已恢复。状态: ${result.status}` };
  }
}

class MemoryApproveCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_memory_approve";
  constructor(private readonly memory: MemoryService) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime memory approve <memoryId>" };
    try {
      this.memory.approve(id, new Date().toISOString());
      return { kind: "text" as const, text: `记忆 ${id} 已批准。` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: "text" as const, text: `记忆 ${id} 批准失败: ${message}` };
    }
  }
}

class MemoryRejectCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_memory_reject";
  constructor(private readonly memory: MemoryService) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime memory reject <memoryId>" };
    try {
      this.memory.reject(id, new Date().toISOString());
      return { kind: "text" as const, text: `记忆 ${id} 已拒绝。` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: "text" as const, text: `记忆 ${id} 拒绝失败: ${message}` };
    }
  }
}

class RecoverCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_recover";
  constructor(
    private readonly store: ControlActionStore,
    private readonly processor: ControlActionProcessor,
    private readonly operatorWorkspaceId: string
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime recover <workflowInstanceId>" };

    const now = new Date().toISOString();
    const actionId = `ca_recover_${Date.now()}`;
    this.store.create({
      id: actionId,
      workspaceId: this.operatorWorkspaceId,
      actorUserId: context.sender.userId,
      actionType: "trigger_recovery",
      payload: { workflowInstanceId: id, runAttemptId: "" },
      now,
    });
    const result = await this.processor.process(actionId, now);
    return { kind: "text" as const, text: result.status === "completed" ? `恢复请求已创建: ${actionId}` : `恢复请求创建失败: ${result.error?.message ?? "未知错误"}` };
  }
}

export function runtimeCommandModule(operatorWorkspaceId?: string): SlashCommandModule {
  return {
    id: "runtime",
    register: (registry, deps) => {
      const workspaceId = deps.operatorWorkspaceId ?? operatorWorkspaceId;

      if (deps.runtimeInspectionService && workspaceId) {
        registry.registerCommand(listDefinition, new ListCommandHandler(deps.runtimeInspectionService, workspaceId));
        registry.registerCommand(showDefinition, new ShowCommandHandler(deps.runtimeInspectionService, workspaceId));
      } else {
        registry.declarePlanned(listDefinition);
        registry.declarePlanned(showDefinition);
      }

      if (deps.controlActionProcessor) {
        registry.registerCommand(approveDefinition, new ApproveCommandHandler(deps.controlActionProcessor));
        registry.registerCommand(rejectDefinition, new RejectCommandHandler(deps.controlActionProcessor));
        if (deps.controlActionStore && workspaceId) {
          registry.registerCommand(cancelDefinition, new CancelCommandHandler(deps.controlActionStore, deps.controlActionProcessor, workspaceId));
        } else {
          registry.declarePlanned(cancelDefinition);
        }
      } else {
        registry.declarePlanned(approveDefinition);
        registry.declarePlanned(rejectDefinition);
        registry.declarePlanned(cancelDefinition);
      }

      if (deps.workflowRuntime && workspaceId) {
        registry.registerCommand(resumeDefinition, new ResumeCommandHandler(deps.workflowRuntime, workspaceId));
      } else {
        registry.declarePlanned(resumeDefinition);
      }

      if (deps.memoryService) {
        registry.registerCommand(memoryApproveDefinition, new MemoryApproveCommandHandler(deps.memoryService));
        registry.registerCommand(memoryRejectDefinition, new MemoryRejectCommandHandler(deps.memoryService));
      } else {
        registry.declarePlanned(memoryApproveDefinition);
        registry.declarePlanned(memoryRejectDefinition);
      }

      if (deps.controlActionProcessor && deps.controlActionStore && workspaceId) {
        registry.registerCommand(recoverDefinition, new RecoverCommandHandler(deps.controlActionStore, deps.controlActionProcessor, workspaceId));
      } else {
        registry.declarePlanned(recoverDefinition);
      }
    }
  };
}
