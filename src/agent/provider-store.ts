import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const CLAUDE_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions"
] as const;
export type ClaudePermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number];

const CodexRecordSchema = z.object({
  kind: z.literal("codex"),
  command: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  sandbox: z.enum(["read-only", "workspace-write", "danger-full-access"]).optional(),
  approvalPolicy: z.enum(["untrusted", "on-request", "never"]).optional(),
  timeoutMs: z.number().positive().optional(),
  model: z.string().min(1).optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  allowedTools: z.array(z.string().min(1)).optional()
});

const ClaudeCodeRecordSchema = z.object({
  kind: z.literal("claude_code"),
  command: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().positive().optional(),
  model: z.string().min(1).optional(),
  mode: z.enum(CLAUDE_PERMISSION_MODES).optional(),
  allowedTools: z.array(z.string().min(1)).optional()
});

export const ProviderRecordSchema = z.discriminatedUnion("kind", [
  CodexRecordSchema,
  ClaudeCodeRecordSchema
]);

export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;
export type ProviderKind = ProviderRecord["kind"];

export const ProvidersFileSchema = z.object({
  schemaVersion: z.literal(1),
  providers: z.array(ProviderRecordSchema),
  activeKind: z.enum(["codex", "claude_code"]).nullable()
});

export type ProvidersFile = z.infer<typeof ProvidersFileSchema>;

export interface ProviderStorePort {
  snapshot(): Readonly<ProvidersFile>;
  upsert(record: ProviderRecord): Promise<void>;
  setActive(kind: ProviderKind | null): Promise<void>;
  updateSettings(kind: ProviderKind, patch: Record<string, unknown>): Promise<ProviderRecord>;
  remove(kind: ProviderKind): Promise<{ activeCleared: boolean }>;
}

const DEFAULT: ProvidersFile = {
  schemaVersion: 1,
  providers: [],
  activeKind: null
};

export class ProviderStore implements ProviderStorePort {
  private constructor(
    private readonly filePath: string,
    private data: ProvidersFile
  ) {}

  static async load(home: string): Promise<ProviderStore> {
    const filePath = join(home, "providers.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, DEFAULT);
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }
    try {
      return new ProviderStore(filePath, ProvidersFileSchema.parse(JSON.parse(raw)));
    } catch (error) {
      throw new Error(`Invalid providers.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  snapshot(): Readonly<ProvidersFile> {
    return {
      schemaVersion: this.data.schemaVersion,
      providers: this.data.providers.map((provider) => ({ ...provider })),
      activeKind: this.data.activeKind
    };
  }

  async upsert(record: ProviderRecord): Promise<void> {
    const validated = ProviderRecordSchema.parse(record);
    if (this.data.providers.some((existing) => existing.kind === validated.kind)) {
      throw new Error(`provider already registered: ${validated.kind}`);
    }
    const next: ProvidersFile = {
      schemaVersion: 1,
      providers: [...this.data.providers, validated],
      activeKind: this.data.activeKind
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
  }

  async setActive(kind: ProviderKind | null): Promise<void> {
    if (kind !== null && !this.data.providers.some((provider) => provider.kind === kind)) {
      throw new Error(`provider not registered: ${kind}`);
    }
    const next: ProvidersFile = {
      schemaVersion: 1,
      providers: this.data.providers.map((provider) => ({ ...provider })),
      activeKind: kind
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
  }

  async updateSettings(
    kind: ProviderKind,
    patch: Record<string, unknown>
  ): Promise<ProviderRecord> {
    const index = this.data.providers.findIndex((entry) => entry.kind === kind);
    if (index === -1) {
      throw new Error(`provider not registered: ${kind}`);
    }
    const current = this.data.providers[index]!;
    const merged = { ...current, ...patch, kind: current.kind, cwd: current.cwd };
    const validated = ProviderRecordSchema.parse(merged);
    const next: ProvidersFile = {
      schemaVersion: 1,
      providers: this.data.providers.map((entry, i) => (i === index ? validated : entry)),
      activeKind: this.data.activeKind
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return { ...validated };
  }

  async remove(kind: ProviderKind): Promise<{ activeCleared: boolean }> {
    if (!this.data.providers.some((provider) => provider.kind === kind)) {
      throw new Error(`provider not registered: ${kind}`);
    }
    const activeCleared = this.data.activeKind === kind;
    const next: ProvidersFile = {
      schemaVersion: 1,
      providers: this.data.providers.filter((provider) => provider.kind !== kind),
      activeKind: activeCleared ? null : this.data.activeKind
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return { activeCleared };
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
