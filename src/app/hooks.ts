import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const HOOK_EVENTS = [
  "scheduler.started",
  "scheduler.stopped",
  "task.completed",
  "task.failed",
  "error"
] as const;

export type HookEventType = (typeof HOOK_EVENTS)[number];

export type HookHandlerType = "command" | "http";

export interface HookConfig {
  event: HookEventType | "*";
  type: HookHandlerType;
  command?: string;
  url?: string;
  timeout?: number;
  async?: boolean;
}

export interface HookEventPayload {
  event: HookEventType;
  timestamp?: string;
  project?: string;
  sessionKey?: string;
  platform?: string;
  userId?: string;
  userName?: string;
  content?: string;
  error?: string;
  extra?: Record<string, unknown>;
}

export class HookManager {
  private readonly hooks: HookConfig[];
  private readonly project: string;

  constructor(project: string, hooks: HookConfig[] = []) {
    this.project = project;
    this.hooks = hooks.filter((hook) => {
      if (!hook.event) {
        console.warn("hooks: skipping config with missing event");
        return false;
      }
      if (hook.type === "command" && !hook.command) {
        console.warn(`hooks: skipping command hook for event ${hook.event} — missing command`);
        return false;
      }
      if (hook.type === "http" && !hook.url) {
        console.warn(`hooks: skipping http hook for event ${hook.event} — missing url`);
        return false;
      }
      return true;
    });
  }

  emit(payload: HookEventPayload): void {
    if (this.hooks.length === 0) {
      return;
    }

    const filled: HookEventPayload = {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      project: this.project
    };

    for (const hook of this.hooks) {
      if (!matchEvent(hook.event, filled.event)) {
        continue;
      }

      const async = hook.async !== false;
      if (async) {
        this.execute(hook, filled).catch((error) => {
          console.warn(`hooks: async hook failed for event ${filled.event}`, error);
        });
      } else {
        this.execute(hook, filled);
      }
    }
  }

  private async execute(hook: HookConfig, payload: HookEventPayload): Promise<void> {
    if (hook.type === "command") {
      await this.executeCommand(hook, payload);
    } else if (hook.type === "http") {
      await this.executeHttp(hook, payload);
    }
  }

  private async executeCommand(hook: HookConfig, payload: HookEventPayload): Promise<void> {
    const timeout = (hook.timeout ?? 10) * 1000;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...eventToEnv(payload)
    };

    try {
      const { stdout, stderr } = await execAsync(hook.command!, {
        timeout,
        env,
        shell: "/bin/sh"
      });
      if (stderr) {
        console.warn(
          `hooks: command stderr for event ${payload.event}: ${stderr.slice(0, 500)}`
        );
      }
      if (stdout) {
        console.debug(
          `hooks: command stdout for event ${payload.event}: ${stdout.slice(0, 500)}`
        );
      }
    } catch (error) {
      console.warn(
        `hooks: command failed for event ${payload.event}: ${errorMessage(error).slice(0, 500)}`
      );
    }
  }

  private async executeHttp(hook: HookConfig, payload: HookEventPayload): Promise<void> {
    const timeout = (hook.timeout ?? 5) * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(hook.url!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Feegle-Hooks/1.0",
          "X-Hook-Event": payload.event
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        console.warn(
          `hooks: http responded ${response.status} for event ${payload.event} to ${hook.url}`
        );
      }
    } catch (error) {
      console.warn(
        `hooks: http failed for event ${payload.event}: ${errorMessage(error).slice(0, 500)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function matchEvent(pattern: string, event: string): boolean {
  if (pattern === "*") {
    return true;
  }
  return pattern === event;
}

function eventToEnv(payload: HookEventPayload): Record<string, string> {
  const env: Record<string, string> = {
    FEEGLE_HOOK_EVENT: payload.event,
    FEEGLE_HOOK_PROJECT: payload.project ?? "",
    FEEGLE_HOOK_TIMESTAMP: payload.timestamp ?? ""
  };
  if (payload.sessionKey) env.FEEGLE_HOOK_SESSION_KEY = payload.sessionKey;
  if (payload.platform) env.FEEGLE_HOOK_PLATFORM = payload.platform;
  if (payload.userId) env.FEEGLE_HOOK_USER_ID = payload.userId;
  if (payload.userName) env.FEEGLE_HOOK_USER_NAME = payload.userName;
  if (payload.content) env.FEEGLE_HOOK_CONTENT = payload.content;
  if (payload.error) env.FEEGLE_HOOK_ERROR = payload.error;
  return env;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
