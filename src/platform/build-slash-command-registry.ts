import { CommandDetailHandler } from "./commands/command-detail.js";
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
} from "./commands/cron/cron-command-handlers.js";
import { HelpCommandHandler } from "./commands/help-command.js";
import { RepoListCommandHandler, type RepositoryListSource } from "./commands/repo-list-command.js";
import {
  ErrorTargetClearCommandHandler,
  ErrorTargetSetCommandHandler,
  ErrorTargetShowCommandHandler
} from "./commands/setup/error-target-command.js";
import type { SchedulerCommandDeps } from "./commands/scheduler-command-deps.js";
import {
  BindStocksCommandHandler,
  PortfolioClearCommandHandler,
  PortfolioListCommandHandler,
  PortfolioSetCommandHandler,
  PortfolioUnsetCommandHandler,
  StocksCommandHandler,
  UnbindStocksCommandHandler
} from "./commands/stock/stock-command-handlers.js";
import { SlashCommandRegistry } from "./slash-command-handler.js";

export interface SlashCommandRegistryDeps {
  repositories: RepositoryListSource;
  ownerIdentities?: SchedulerCommandDeps["ownerIdentities"];
  taskRegistry?: SchedulerCommandDeps["taskRegistry"];
  configStore?: SchedulerCommandDeps["configStore"];
  stockStore?: SchedulerCommandDeps["stockStore"];
  quote?: SchedulerCommandDeps["quote"];
  kinds?: SchedulerCommandDeps["kinds"];
  scheduler?: SchedulerCommandDeps["scheduler"];
  runsLog?: SchedulerCommandDeps["runsLog"];
}

/**
 * Wire the implemented slash command handlers into a registry.
 *
 * New commands register here exactly once. The responder never grows
 * an if-else per command.
 */
export function buildSlashCommandRegistry(deps: SlashCommandRegistryDeps): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  registry.register(new HelpCommandHandler(registry));
  registry.register(new CommandDetailHandler(registry));
  registry.register(new RepoListCommandHandler(deps.repositories));
  const schedulerDeps = schedulerCommandDeps(deps);
  if (schedulerDeps) {
    registry.register(new CronListCommandHandler(schedulerDeps));
    registry.register(new CronShowCommandHandler(schedulerDeps));
    registry.register(new CronAddCommandHandler(schedulerDeps));
    registry.register(new CronEditCommandHandler(schedulerDeps));
    registry.register(new CronRemoveCommandHandler(schedulerDeps));
    registry.register(new CronPauseCommandHandler(schedulerDeps));
    registry.register(new CronResumeCommandHandler(schedulerDeps));
    registry.register(new CronRunNowCommandHandler(schedulerDeps));
    registry.register(new CronSetTargetCommandHandler(schedulerDeps));
    registry.register(new CronHistoryCommandHandler(schedulerDeps));
    registry.register(new BindStocksCommandHandler(schedulerDeps));
    registry.register(new UnbindStocksCommandHandler(schedulerDeps));
    registry.register(new StocksCommandHandler(schedulerDeps));
    registry.register(new PortfolioSetCommandHandler(schedulerDeps));
    registry.register(new PortfolioListCommandHandler(schedulerDeps));
    registry.register(new PortfolioClearCommandHandler(schedulerDeps));
    registry.register(new PortfolioUnsetCommandHandler(schedulerDeps));
    registry.register(new ErrorTargetSetCommandHandler(schedulerDeps));
    registry.register(new ErrorTargetShowCommandHandler(schedulerDeps));
    registry.register(new ErrorTargetClearCommandHandler(schedulerDeps));
  }
  return registry;
}

function schedulerCommandDeps(deps: SlashCommandRegistryDeps): SchedulerCommandDeps | undefined {
  if (
    !deps.ownerIdentities ||
    !deps.taskRegistry ||
    !deps.configStore ||
    !deps.stockStore ||
    !deps.quote ||
    !deps.kinds ||
    !deps.scheduler
  ) {
    return undefined;
  }
  return {
    ownerIdentities: deps.ownerIdentities,
    taskRegistry: deps.taskRegistry,
    configStore: deps.configStore,
    stockStore: deps.stockStore,
    quote: deps.quote,
    kinds: deps.kinds,
    scheduler: deps.scheduler,
    runsLog: deps.runsLog
  };
}
