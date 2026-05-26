import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { warnStartupGaps } from "../warn-startup-gaps.js";
import type { ConfigStorePort } from "../../app/config-store.js";
import type { Startable } from "../../app/feegle-app.js";
import type { HookManager } from "../../app/hooks.js";
import type { NotificationBroker } from "../../app/notification-broker.js";
import { ConsoleJsonLogger } from "../../scheduler/logger.js";
import { TaskScheduler } from "../../scheduler/task-scheduler.js";
import { RuntimeHostInfoProvider } from "../../scheduler/util/host-info.js";

export interface SchedulerPhaseDeps {
  ownerEmails: ReadonlySet<string>;
  hooks?: HookManager;
  createScheduler?: (deps: { notify: NotificationBroker; configStore: ConfigStorePort; hooks?: HookManager }) => Startable;
  onScheduler(scheduler: Startable): void;
}

export function schedulerPhase(deps: SchedulerPhaseDeps): BootPhase {
  return {
    name: "scheduler",
    run: async (ctx: BootContext) => {
      const { configStore, taskRegistry, kinds, dedupStore, runsLog, notify, agents } = ctx.pick(
        "configStore",
        "taskRegistry",
        "kinds",
        "dedupStore",
        "runsLog",
        "notify",
        "agents"
      );
      warnStartupGaps(configStore, taskRegistry, deps.ownerEmails);
      const scheduler =
        deps.createScheduler?.({ notify, configStore, hooks: deps.hooks }) ??
        new TaskScheduler({
          registry: taskRegistry,
          configStore,
          kinds,
          dedup: dedupStore,
          runsLog,
          notify,
          agents,
          host: new RuntimeHostInfoProvider(),
          clock: { now: () => new Date() },
          logger: new ConsoleJsonLogger(),
          hooks: deps.hooks
        });
      await scheduler.start();
      deps.hooks?.emit({ event: "scheduler.started" });
      ctx.provide("scheduler", scheduler as TaskScheduler);
      deps.onScheduler(scheduler);
    }
  };
}
