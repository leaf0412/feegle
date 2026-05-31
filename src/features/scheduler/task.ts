import { z } from "zod";
import { NotificationTargetSchema } from "../../infra/app/config-store.js";
import type { NotificationTarget } from "../../infra/app/notification-port.js";

export type ErrorPolicy = "always" | "on-change" | "silent";
export type TaskSource = "seed" | "domain" | "user";
export type TaskRunStatus = "ok" | "silent" | "noop" | "skipped" | "failed";

export interface TaskLastRun {
  at: string;
  status: TaskRunStatus;
  durationMs: number;
  note?: string;
}

export interface Task {
  id: string;
  name: string;
  kind: string;
  params: Record<string, unknown>;
  cron: string;
  timezone: string;
  activeHours: string[] | null;
  target: NotificationTarget | null;
  enabled: boolean;
  source: TaskSource;
  errorPolicy: ErrorPolicy;
  createdAt: string;
  updatedAt: string;
  lastRun: TaskLastRun | null;
  consecutiveFailures: number;
  lastErrorNotifiedAt: string | null;
}

export const TaskLastRunSchema = z.object({
  at: z.string(),
  status: z.enum(["ok", "silent", "noop", "skipped", "failed"]),
  durationMs: z.number().nonnegative(),
  note: z.string().optional()
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  params: z.record(z.unknown()),
  cron: z.string().min(1),
  timezone: z.string().min(1),
  activeHours: z.array(z.string().min(1)).nullable(),
  target: NotificationTargetSchema.nullable(),
  enabled: z.boolean(),
  source: z.enum(["seed", "domain", "user"]),
  errorPolicy: z.enum(["always", "on-change", "silent"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRun: TaskLastRunSchema.nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastErrorNotifiedAt: z.string().nullable()
});
