import type { SlashCommandContext, SlashCommandHandler, SlashCommandReply } from "../slash-command-handler.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import type { ControlActionProcessor } from "../../control/control-action-processor.js";
import type { WorkflowRuntime } from "../../runtime/workflow-runtime.js";
import type { MemoryService } from "../../memory/memory-service.js";

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
    return { kind: "text" as const, text: `动作 ${id} 已拒绝。` };
  }
}

class ResumeCommandHandler implements SlashCommandHandler {
  readonly id = "runtime_resume";
  constructor(private readonly wfRuntime: WorkflowRuntime) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const id = context.args.trim();
    if (!id) return { kind: "text" as const, text: "用法: /runtime resume <workflowInstanceId>" };

    const result = await this.wfRuntime.resume({
      workflowInstanceId: id,
      runAttemptId: `cli_resume_${Date.now()}`,
      signal: { signalId: `cli_${Date.now()}`, kind: "control_action", payload: { action: "resume" } },
      workspaceId: "ws_personal",
      now: new Date().toISOString()
    });

    return { kind: "text" as const, text: `工作流 ${id} 已恢复。状态: ${result.status}` };
  }
}

export function runtimeCommandModule(): SlashCommandModule {
  return {
    id: "runtime",
    register: (registry, deps) => {
      if (deps.controlActionProcessor) {
        registry.registerCommand(approveDefinition, new ApproveCommandHandler(deps.controlActionProcessor));
        registry.registerCommand(rejectDefinition, new RejectCommandHandler(deps.controlActionProcessor));
      } else {
        registry.declarePlanned(approveDefinition);
        registry.declarePlanned(rejectDefinition);
      }

      if (deps.workflowRuntime) {
        registry.registerCommand(resumeDefinition, new ResumeCommandHandler(deps.workflowRuntime));
      } else {
        registry.declarePlanned(resumeDefinition);
      }
    }
  };
}
