import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { NotificationTarget } from "./notification-port.js";
import { createDefaultJsonFile, writeJsonAtomically } from "./json-file.js";
import { parseJsonc } from "./jsonc.js";

export const NotificationTargetSchema = z.object({
  platform: z.literal("feishu"),
  chatId: z.string().min(1)
});

export const AgentProviderConfigSchema = z
  .object({
    command: z.string().min(1),
    cwd: z.string().min(1).optional(),
    sandbox: z.enum(["read-only", "workspace-write", "danger-full-access"]).optional(),
    approvalPolicy: z.enum(["untrusted", "on-request", "never"]).optional(),
    timeoutMs: z.number().positive().optional(),
    model: z.string().min(1).optional(),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
    mode: z.string().min(1).optional(),
    allowedTools: z.array(z.string().min(1)).optional()
  })
  .passthrough();

export const AgentConfigSchema = z.object({
  default: z.string().min(1),
  providers: z.record(AgentProviderConfigSchema)
});

export const FeegleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  failureTarget: NotificationTargetSchema.nullable(),
  agent: AgentConfigSchema.optional(),
  workspaces: z.record(z.string().min(1)).optional()
});

export type FeegleConfig = z.infer<typeof FeegleConfigSchema>;

export interface ConfigStorePort {
  get(): Readonly<FeegleConfig>;
  setFailureTarget(target: NotificationTarget | null): Promise<void>;
}

const DEFAULT_CONFIG: FeegleConfig = {
  schemaVersion: 1,
  failureTarget: null
};

export class ConfigStore {
  private constructor(
    private readonly filePath: string,
    private data: FeegleConfig
  ) {}

  static async load(home: string): Promise<ConfigStore> {
    const filePath = await resolveConfigPath(home);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, DEFAULT_CONFIG);
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }

    try {
      const parsed = filePath.endsWith(".jsonc") ? parseJsonc(raw, filePath) : JSON.parse(raw);
      return new ConfigStore(filePath, FeegleConfigSchema.parse(parsed));
    } catch (error) {
      throw new Error(`Invalid config at ${filePath}: ${errorMessage(error)}`);
    }
  }

  get(): Readonly<FeegleConfig> {
    const config: FeegleConfig = {
      schemaVersion: this.data.schemaVersion,
      failureTarget: this.data.failureTarget ? { ...this.data.failureTarget } : null
    };
    if (this.data.agent) {
      config.agent = {
        default: this.data.agent.default,
        providers: cloneProviders(this.data.agent.providers)
      };
    }
    if (this.data.workspaces) {
      config.workspaces = { ...this.data.workspaces };
    }
    return config;
  }

  async setFailureTarget(target: NotificationTarget | null): Promise<void> {
    this.data = {
      schemaVersion: 1,
      failureTarget: target ? NotificationTargetSchema.parse(target) : null
    };
    await writeJsonAtomically(this.filePath, this.data);
  }
}

async function resolveConfigPath(home: string): Promise<string> {
  const jsoncPath = join(home, "config.jsonc");
  if (await pathExists(jsoncPath)) {
    return jsoncPath;
  }
  return join(home, "config.json");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function cloneProviders(providers: NonNullable<FeegleConfig["agent"]>["providers"]): NonNullable<FeegleConfig["agent"]>["providers"] {
  return Object.fromEntries(Object.entries(providers).map(([kind, provider]) => [kind, { ...provider }]));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
