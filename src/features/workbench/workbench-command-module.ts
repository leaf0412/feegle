import { defineSlashCommand } from "@platform/slash-command-catalog.js";
import type { SlashCommandContext, SlashCommandHandler, SlashCommandRegistry, SlashCommandReply } from "@platform/slash-command-handler.js";
import type { SlashCommandModule } from "@platform/slash-command-module.js";
import type { WorkbenchCardService } from "@features/workbench/workbench-card-service.js";
import type { WorkbenchButton } from "@features/workbench/workbench-models.js";
import type { SlashCommandDefinition } from "@platform/slash-command-catalog.js";

const workbenchDefinition = defineSlashCommand(
  "workbench",
  "/workbench",
  "工作台操作",
  "workspace",
  "act:/workbench",
);

const SLUG_TO_BUTTON: Record<string, WorkbenchButton> = {
  manage_repos: "manage_repos",
  add_repo: "add_repo",
  remove_repo: "remove_repo",
  back: "back",
  discuss: "discuss_requirement",
  revise_requirement: "revise_requirement",
  generate_plan: "generate_plan",
  revise_plan: "revise_plan",
  delete_requirement: "delete_requirement",
  delete_plan: "delete_plan",
};

class WorkbenchCommandHandler implements SlashCommandHandler {
  readonly id = "workbench";
  constructor(private readonly service: WorkbenchCardService) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const slug = context.args.split(/\s+/, 1)[0] ?? "";
    const button = SLUG_TO_BUTTON[slug];
    if (!button) {
      return { kind: "text", text: `未知的工作台操作：${slug || "(空)"}` };
    }
    const payload = context.args.slice(slug.length).trim() || undefined;
    try {
      const card = await this.service.handleAction(context.chatId, button, payload);
      return context.source === "card"
        ? { kind: "card_update", card }
        : { kind: "card", card };
    } catch (error) {
      return { kind: "text", text: `工作台操作失败：${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

class WorkbenchPlannedHandler implements SlashCommandHandler {
  readonly id = "workbench";
  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    return { kind: "text", text: "工作台功能仍在规划中，暂未接入执行器。" };
  }
}

export function workbenchCommandModule(): SlashCommandModule {
  return {
    id: "workbench",
    register: (registry: SlashCommandRegistry, deps) => {
      if (deps.workbenchCardService) {
        registry.registerCommand(
          workbenchDefinition,
          new WorkbenchCommandHandler(deps.workbenchCardService)
        );
      } else {
        registry.registerCommand(workbenchDefinition, new WorkbenchPlannedHandler());
      }
    }
  };
}
