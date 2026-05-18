import type { SchedulerCommandDeps } from "./scheduler-command-deps.js";
import type { SlashCommandModule, SlashCommandRegistryDeps } from "../slash-command-module.js";
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

export function schedulerCommandModule(): SlashCommandModule {
  return {
    id: "scheduler",
    register: (registry, deps) => {
      const schedulerDeps = schedulerCommandDeps(deps);
      if (!schedulerDeps) {
        return;
      }
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
  };
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
