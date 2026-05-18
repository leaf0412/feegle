import type { SlashCommandContext, SlashCommandHandler, SlashCommandReply } from "../../slash-command-handler.js";
import { isOwner } from "../../owner-access.js";
import type { SchedulerCommandDeps } from "../scheduler-command-deps.js";

abstract class ErrorTargetCommand implements SlashCommandHandler {
  readonly ownerOnly = true;

  constructor(protected readonly deps: Pick<SchedulerCommandDeps, "ownerIdentities" | "configStore">) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerIdentities);
  }

  abstract readonly id: string;
  abstract execute(context: SlashCommandContext): Promise<SlashCommandReply>;
}

export class ErrorTargetSetCommandHandler extends ErrorTargetCommand {
  readonly id = "error_target_set";

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    await this.deps.configStore.setFailureTarget({ platform: "feishu", chatId: context.chatId });
    return {
      kind: "text",
      text: `✅ 故障通知群已绑定到本群（feishu:${context.chatId}）。后续所有任务失败通知将发到这里。`
    };
  }
}

export class ErrorTargetShowCommandHandler extends ErrorTargetCommand {
  readonly id = "error_target_show";

  async execute(): Promise<SlashCommandReply> {
    const target = this.deps.configStore.get().failureTarget;
    return {
      kind: "text",
      text: target ? `当前故障通知群: feishu:${target.chatId}` : "未设置故障通知群。请在目标群运行 /error_target set。"
    };
  }
}

export class ErrorTargetClearCommandHandler extends ErrorTargetCommand {
  readonly id = "error_target_clear";

  async execute(): Promise<SlashCommandReply> {
    await this.deps.configStore.setFailureTarget(null);
    return { kind: "text", text: "✅ 已解绑故障通知群。注意：此后失败通知只进运行日志，请尽快重新绑定。" };
  }
}
