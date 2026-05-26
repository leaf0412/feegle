import type { BootContext } from "./boot-context.js";

export type BootPhaseName =
  | "infra"
  | "stores"
  | "providers"
  | "kinds"
  | "scheduler"
  | "commands"
  | "runtime";

export interface BootPhase {
  readonly name: BootPhaseName;
  run(ctx: BootContext): Promise<void>;
}

export interface PhaseResult {
  phase: BootPhaseName;
  status: "ok" | "failed";
  durationMs: number;
  error?: string;
}

export interface BootReport {
  phases: PhaseResult[];
  totalMs: number;
}

export class BootAbortError extends Error {
  constructor(
    readonly phase: BootPhaseName,
    readonly cause: unknown,
    readonly report: PhaseResult[]
  ) {
    super(`boot aborted in phase "${phase}": ${String(cause)}`);
    this.name = "BootAbortError";
  }
}
