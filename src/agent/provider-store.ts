import { z } from "zod";
import type { ConfigStoreProviderWriter } from "../app/config-store.js";

export const ProviderRecordSchema = z
  .object({
    kind: z.string().min(1),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string()).optional(),
    model: z.string().min(1).optional(),
    timeoutMs: z.number().positive().optional()
  })
  .passthrough();

export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;
export type ProviderKind = string;

export const ProvidersFileSchema = z.object({
  schemaVersion: z.literal(1),
  providers: z.array(ProviderRecordSchema),
  activeKind: z.string().nullable()
});

export type ProvidersFile = z.infer<typeof ProvidersFileSchema>;

export interface ProviderStorePort {
  snapshot(): Readonly<ProvidersFile>;
  upsert(record: ProviderRecord): Promise<void>;
  setActive(kind: ProviderKind | null): Promise<void>;
  updateSettings(kind: ProviderKind, patch: Record<string, unknown>): Promise<ProviderRecord>;
  remove(kind: ProviderKind): Promise<{ activeCleared: boolean }>;
}

/**
 * ProviderStore is a view over ConfigStore — there is no separate `providers.json` file. Reads
 * project the `agent.providers` block in config.jsonc into the legacy ProvidersFile shape that
 * existing callers (slash-command handlers, build-agent-provider-registry) already speak. Writes
 * route through ConfigStore.setAgentProvider / setAgentDefault / removeAgentProvider, which
 * preserves comments and `{env:...}` tokens in config.jsonc via surgical JSONC edits.
 */
export class ProviderStore implements ProviderStorePort {
  private constructor(private readonly configStore: ConfigStoreProviderWriter) {}

  static fromConfig(configStore: ConfigStoreProviderWriter): ProviderStore {
    return new ProviderStore(configStore);
  }

  snapshot(): Readonly<ProvidersFile> {
    const cfg = this.configStore.get();
    const providersBlock = cfg.agent?.providers ?? {};
    const providers = Object.entries(providersBlock).map(([kind, record]) =>
      ProviderRecordSchema.parse({ kind, ...record })
    );
    return {
      schemaVersion: 1,
      providers,
      activeKind: cfg.agent?.default ?? null
    };
  }

  async upsert(record: ProviderRecord): Promise<void> {
    const validated = ProviderRecordSchema.parse(record);
    const existing = this.configStore.get().agent?.providers ?? {};
    if (existing[validated.kind] !== undefined) {
      throw new Error(`provider already registered: ${validated.kind}`);
    }
    const { kind, ...rest } = validated;
    await this.configStore.setAgentProvider(kind, rest);
  }

  async setActive(kind: ProviderKind | null): Promise<void> {
    if (kind !== null) {
      const providers = this.configStore.get().agent?.providers ?? {};
      if (providers[kind] === undefined) {
        throw new Error(`provider not registered: ${kind}`);
      }
    }
    await this.configStore.setAgentDefault(kind);
  }

  async updateSettings(
    kind: ProviderKind,
    patch: Record<string, unknown>
  ): Promise<ProviderRecord> {
    const existing = this.configStore.get().agent?.providers?.[kind];
    if (existing === undefined) {
      throw new Error(`provider not registered: ${kind}`);
    }
    const merged = { ...existing, ...patch, kind, cwd: existing.cwd };
    const validated = ProviderRecordSchema.parse(merged);
    const { kind: _k, ...rest } = validated;
    await this.configStore.setAgentProvider(kind, rest);
    return { ...validated };
  }

  async remove(kind: ProviderKind): Promise<{ activeCleared: boolean }> {
    const providers = this.configStore.get().agent?.providers ?? {};
    if (providers[kind] === undefined) {
      throw new Error(`provider not registered: ${kind}`);
    }
    return this.configStore.removeAgentProvider(kind);
  }
}
