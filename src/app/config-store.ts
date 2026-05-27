import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { NotificationTarget } from "./notification-port.js";
import { createDefaultJsonFile, writeTextAtomically } from "./json-file.js";
import { parseJsonc, setJsoncValue } from "./jsonc.js";

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

export const FeishuConfigSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  enableInteractiveCards: z.boolean(),
  allowFrom: z.string(),
  allowChat: z.string(),
  groupOnly: z.boolean(),
  groupReplyAll: z.boolean(),
  shareSessionInChannel: z.boolean(),
  threadIsolation: z.boolean(),
  replyToTrigger: z.boolean(),
  progressStyle: z.enum(["legacy", "compact", "card"]),
  reactionEmoji: z.string(),
  verificationToken: z.string().min(1).optional(),
  encryptKey: z.string().min(1).optional(),
  botOpenId: z.string().min(1).optional(),
  doneEmoji: z.string().min(1).optional()
});

export const GitLabConfigSchema = z.object({
  token: z.string().min(1),
  host: z.string().min(1),
  workspace: z.string().min(1)
});

export const FeegleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  failureTarget: NotificationTargetSchema.nullable(),
  agent: AgentConfigSchema.optional(),
  workspaces: z.record(z.string().min(1)).optional(),
  ownerEmails: z.array(z.string().min(1)).optional(),
  feishu: FeishuConfigSchema.optional(),
  gitlab: GitLabConfigSchema.optional()
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
    private data: FeegleConfig,
    private rawText: string
  ) {}

  static async load(home: string, env: NodeJS.ProcessEnv = process.env): Promise<ConfigStore> {
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
      const resolved = interpolateEnv(parsed, env);
      return new ConfigStore(filePath, FeegleConfigSchema.parse(resolved), raw);
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
    if (this.data.ownerEmails) {
      config.ownerEmails = [...this.data.ownerEmails];
    }
    if (this.data.feishu) {
      config.feishu = { ...this.data.feishu };
    }
    if (this.data.gitlab) {
      config.gitlab = { ...this.data.gitlab };
    }
    return config;
  }

  async setFailureTarget(target: NotificationTarget | null): Promise<void> {
    const value = target ? NotificationTargetSchema.parse(target) : null;
    // Edit only the failureTarget field in the raw source so every other field, the {env:...}
    // tokens and JSONC comments survive — never rewrite the whole file from the resolved in-memory
    // config (that would persist plaintext secrets and drop sections).
    this.rawText = setJsoncValue(this.rawText, ["failureTarget"], value);
    await writeTextAtomically(this.filePath, this.rawText);
    this.data = { ...this.data, failureTarget: value };
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

/**
 * Resolve `{env:VAR_NAME}` references in every string value against `env`, so config.jsonc can
 * point at system environment variables instead of holding plaintext secrets. A referenced variable
 * that is unset or empty throws — no silent fallback.
 */
function interpolateEnv<T>(value: T, env: NodeJS.ProcessEnv): T {
  if (typeof value === "string") {
    return resolveEnvTokens(value, env) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateEnv(item, env)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateEnv(item, env)])
    ) as T;
  }
  return value;
}

function resolveEnvTokens(input: string, env: NodeJS.ProcessEnv): string {
  return input.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
    const resolved = env[name];
    if (resolved === undefined || resolved === "") {
      throw new Error(`references environment variable ${name} which is not set`);
    }
    return resolved;
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
