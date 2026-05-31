import type { TaskContext } from "./task-context.js";

export type HandlerOutcome = "sent" | "silent" | "noop";

export interface HandlerRunResult {
  outcome: HandlerOutcome;
  note?: string;
}

export interface HandlerKind<TParams = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  parseParams(input: unknown): TParams;
  describeParams(params: TParams): string;
  run(ctx: TaskContext, params: TParams): Promise<HandlerRunResult>;
}
