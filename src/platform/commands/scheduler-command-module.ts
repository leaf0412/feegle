import type { SchedulerCommandDeps } from "./scheduler-command-deps.js";
import type { SlashCommandModule, SlashCommandRegistryDeps } from "../slash-command-module.js";
import { defineSlashCommand, type SlashCommandDefinition } from "../slash-command-catalog.js";
import {
  CronAddCommandHandler,
  CronEditCommandHandler,
  CronHistoryCommandHandler,
  CronListCommandHandler,
  CronPauseCommandHandler,
  CronRemoveCommandHandler,
  CronResumeCommandHandler,
  CronRunNowCommandHandler,
  CronSetTargetCommandHandler,
  CronShowCommandHandler
} from "./cron/cron-command-handlers.js";
import {
  ErrorTargetClearCommandHandler,
  ErrorTargetSetCommandHandler,
  ErrorTargetShowCommandHandler
} from "./setup/error-target-command.js";
import {
  BindStocksCommandHandler,
  PortfolioClearCommandHandler,
  PortfolioListCommandHandler,
  PortfolioSetCommandHandler,
  PortfolioUnsetCommandHandler,
  StocksCommandHandler,
  UnbindStocksCommandHandler
} from "./stock/stock-command-handlers.js";

const cronDefinitions = {
  cron_list: defineSlashCommand("cron_list", "/cron list", "列出所有任务", "cron", "cmd:/cron list"),
  cron_show: defineSlashCommand("cron_show", "/cron show <id>", "查看任务详情", "cron", "cmd:/cron show"),
  cron_add: defineSlashCommand("cron_add", "/cron add <kind> <cron> [k=v…]", "创建任务", "cron", "cmd:/cron add"),
  cron_edit: defineSlashCommand("cron_edit", "/cron edit <id> [k=v…]", "修改任务", "cron", "cmd:/cron edit"),
  cron_remove: defineSlashCommand("cron_remove", "/cron remove <id>", "删除任务", "cron", "cmd:/cron remove"),
  cron_pause: defineSlashCommand("cron_pause", "/cron pause <id>", "暂停任务", "cron", "cmd:/cron pause"),
  cron_resume: defineSlashCommand("cron_resume", "/cron resume <id>", "恢复任务", "cron", "cmd:/cron resume"),
  cron_run_now: defineSlashCommand("cron_run_now", "/cron run-now <id> [--force]", "立刻触发", "cron", "cmd:/cron run-now"),
  cron_set_target: defineSlashCommand("cron_set_target", "/cron set-target <id> [chatId]", "设置任务通知群", "cron", "cmd:/cron set-target"),
  cron_history: defineSlashCommand("cron_history", "/cron history <id> [--last N]", "查看运行历史", "cron", "cmd:/cron history")
} satisfies Record<string, SlashCommandDefinition>;

const stockDefinitions = {
  bind_stocks: defineSlashCommand("bind_stocks", "/bind_stocks <codes>", "订阅股票监控", "stock", "cmd:/bind_stocks"),
  unbind_stocks: defineSlashCommand("unbind_stocks", "/unbind_stocks <codes>", "取消订阅", "stock", "cmd:/unbind_stocks"),
  stocks: defineSlashCommand("stocks", "/stocks [codes]", "即时查询", "stock", "cmd:/stocks"),
  portfolio_set: defineSlashCommand("portfolio_set", "/portfolio set <code> k=v…", "设置持仓", "stock", "cmd:/portfolio set"),
  portfolio_list: defineSlashCommand("portfolio_list", "/portfolio list", "查看持仓", "stock", "cmd:/portfolio list"),
  portfolio_clear: defineSlashCommand("portfolio_clear", "/portfolio clear <code>", "清除某条持仓", "stock", "cmd:/portfolio clear"),
  portfolio_unset: defineSlashCommand("portfolio_unset", "/portfolio unset <code> <field>", "清空某字段", "stock", "cmd:/portfolio unset")
} satisfies Record<string, SlashCommandDefinition>;

const setupDefinitions = {
  error_target_set: defineSlashCommand("error_target_set", "/error_target set", "绑定故障通知群", "setup", "cmd:/error_target set"),
  error_target_show: defineSlashCommand("error_target_show", "/error_target show", "查看故障通知群", "setup", "cmd:/error_target show"),
  error_target_clear: defineSlashCommand("error_target_clear", "/error_target clear", "解绑故障通知群", "setup", "cmd:/error_target clear")
} satisfies Record<string, SlashCommandDefinition>;

export function schedulerCommandModule(): SlashCommandModule {
  return {
    id: "scheduler",
    register: (registry, deps) => {
      const schedulerDeps = requireSchedulerDeps(deps);
      registry.registerCommand(cronDefinitions.cron_list, new CronListCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_show, new CronShowCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_add, new CronAddCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_edit, new CronEditCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_remove, new CronRemoveCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_pause, new CronPauseCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_resume, new CronResumeCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_run_now, new CronRunNowCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_set_target, new CronSetTargetCommandHandler(schedulerDeps));
      registry.registerCommand(cronDefinitions.cron_history, new CronHistoryCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.bind_stocks, new BindStocksCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.unbind_stocks, new UnbindStocksCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.stocks, new StocksCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.portfolio_set, new PortfolioSetCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.portfolio_list, new PortfolioListCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.portfolio_clear, new PortfolioClearCommandHandler(schedulerDeps));
      registry.registerCommand(stockDefinitions.portfolio_unset, new PortfolioUnsetCommandHandler(schedulerDeps));
      registry.registerCommand(setupDefinitions.error_target_set, new ErrorTargetSetCommandHandler(schedulerDeps));
      registry.registerCommand(setupDefinitions.error_target_show, new ErrorTargetShowCommandHandler(schedulerDeps));
      registry.registerCommand(setupDefinitions.error_target_clear, new ErrorTargetClearCommandHandler(schedulerDeps));
    }
  };
}

function requireSchedulerDeps(deps: SlashCommandRegistryDeps): SchedulerCommandDeps {
  const missing: string[] = [];
  if (!deps.ownerEmails) missing.push("ownerEmails");
  if (!deps.taskRegistry) missing.push("taskRegistry");
  if (!deps.configStore) missing.push("configStore");
  if (!deps.stockStore) missing.push("stockStore");
  if (!deps.quote) missing.push("quote");
  if (!deps.kinds) missing.push("kinds");
  if (!deps.scheduler) missing.push("scheduler");
  if (missing.length > 0) {
    throw new Error(`scheduler command module requires deps: ${missing.join(", ")}`);
  }
  return {
    ownerEmails: deps.ownerEmails!,
    taskRegistry: deps.taskRegistry!,
    configStore: deps.configStore!,
    stockStore: deps.stockStore!,
    quote: deps.quote!,
    kinds: deps.kinds!,
    scheduler: deps.scheduler!,
    runsLog: deps.runsLog
  };
}
