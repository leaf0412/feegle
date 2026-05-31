import { z } from "zod";
import { createPlatformCard } from "../../../platform/platform-card.js";
import type { HandlerKind, HandlerRunResult } from "../handler-kind.js";
import type { TaskContext } from "../task-context.js";
import type { Task } from "../task.js";

const ParamsSchema = z.object({}).default({});

export class HeartbeatKind implements HandlerKind<Record<string, never>> {
  readonly id = "heartbeat";
  readonly title = "Heartbeat";
  readonly description = "Reports process status";

  constructor(private readonly deps: { taskRegistry: { list(): readonly Task[] } }) {}

  parseParams(input: unknown): Record<string, never> {
    return ParamsSchema.parse(input);
  }

  describeParams(): string {
    return "no params";
  }

  async run(ctx: TaskContext, _params: Record<string, never>): Promise<HandlerRunResult> {
    if (!ctx.task.target) {
      return { outcome: "noop", note: "no target" };
    }
    const host = await ctx.host.read();
    const tasks = this.deps.taskRegistry.list();
    const enabled = tasks.filter((task) => task.enabled).length;
    const disabled = tasks.length - enabled;
    const card = createPlatformCard()
      .title("feegle heartbeat", "green")
      .markdown(`进程: PID ${host.pid}\n主机: ${host.hostname}\n任务总数: ${enabled} enabled / ${disabled} disabled`)
      .build();
    await ctx.notify.sendCard(ctx.task.target, card);
    return { outcome: "sent" };
  }
}
