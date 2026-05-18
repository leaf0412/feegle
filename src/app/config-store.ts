import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { NotificationTarget } from "./notification-port.js";
import { createDefaultJsonFile, writeJsonAtomically } from "./json-file.js";

export const NotificationTargetSchema = z.object({
  platform: z.literal("feishu"),
  chatId: z.string().min(1)
});

export const FeegleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  failureTarget: NotificationTargetSchema.nullable()
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
    const filePath = join(home, "config.json");
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
      return new ConfigStore(filePath, FeegleConfigSchema.parse(JSON.parse(raw)));
    } catch (error) {
      throw new Error(`Invalid config.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  get(): Readonly<FeegleConfig> {
    return {
      schemaVersion: this.data.schemaVersion,
      failureTarget: this.data.failureTarget ? { ...this.data.failureTarget } : null
    };
  }

  async setFailureTarget(target: NotificationTarget | null): Promise<void> {
    this.data = {
      schemaVersion: 1,
      failureTarget: target ? { ...target } : null
    };
    await writeJsonAtomically(this.filePath, this.data);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
