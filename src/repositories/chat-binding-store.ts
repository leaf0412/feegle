import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";

export const ChatBindingSchema = z.object({
  chatId: z.string().min(1),
  branch: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  repositoryIds: z.array(z.string().min(1)),
  updatedAt: z.string()
});

export type ChatBinding = z.infer<typeof ChatBindingSchema>;

export const ChatBindingsFileSchema = z.object({
  schemaVersion: z.literal(1),
  bindings: z.array(ChatBindingSchema)
});

export type ChatBindingsFile = z.infer<typeof ChatBindingsFileSchema>;

const DEFAULT: ChatBindingsFile = { schemaVersion: 1, bindings: [] };

export interface BindInput {
  chatId: string;
  branch?: string;
  baseBranch?: string;
  repositoryIds?: string[];
}

export class ChatBindingStore {
  private constructor(
    private readonly filePath: string,
    private data: ChatBindingsFile,
    private readonly clock: () => Date
  ) {}

  static async load(home: string, clock: () => Date = () => new Date()): Promise<ChatBindingStore> {
    const filePath = join(home, "chat-bindings.json");
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
      return new ChatBindingStore(filePath, ChatBindingsFileSchema.parse(JSON.parse(raw)), clock);
    } catch (error) {
      throw new Error(`Invalid chat-bindings.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  get(chatId: string): ChatBinding | undefined {
    const b = this.data.bindings.find((entry) => entry.chatId === chatId);
    return b ? { ...b, repositoryIds: [...b.repositoryIds] } : undefined;
  }

  async upsert(input: BindInput): Promise<ChatBinding> {
    const now = this.clock().toISOString();
    const existing = this.data.bindings.find((entry) => entry.chatId === input.chatId);
    const merged: ChatBinding = {
      chatId: input.chatId,
      branch: input.branch ?? existing?.branch,
      baseBranch: input.baseBranch ?? existing?.baseBranch,
      repositoryIds: input.repositoryIds ?? existing?.repositoryIds ?? [],
      updatedAt: now
    };
    const next: ChatBindingsFile = {
      schemaVersion: 1,
      bindings: existing
        ? this.data.bindings.map((entry) => (entry.chatId === input.chatId ? merged : entry))
        : [...this.data.bindings, merged]
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return { ...merged, repositoryIds: [...merged.repositoryIds] };
  }

  async addRepository(chatId: string, repositoryId: string): Promise<ChatBinding> {
    const existing = this.data.bindings.find((entry) => entry.chatId === chatId);
    const repositoryIds = existing
      ? existing.repositoryIds.includes(repositoryId)
        ? existing.repositoryIds
        : [...existing.repositoryIds, repositoryId]
      : [repositoryId];
    return this.upsert({ chatId, repositoryIds });
  }

  async removeRepository(
    chatId: string,
    repositoryId: string
  ): Promise<{ removed: boolean; binding?: ChatBinding }> {
    const existing = this.data.bindings.find((entry) => entry.chatId === chatId);
    if (!existing || !existing.repositoryIds.includes(repositoryId)) {
      return { removed: false, binding: existing ? this.get(chatId) : undefined };
    }
    const remaining = existing.repositoryIds.filter((id) => id !== repositoryId);
    if (remaining.length === 0) {
      await this.clear(chatId);
      return { removed: true };
    }
    const binding = await this.upsert({ chatId, repositoryIds: remaining });
    return { removed: true, binding };
  }

  async clear(chatId: string): Promise<boolean> {
    const remaining = this.data.bindings.filter((entry) => entry.chatId !== chatId);
    if (remaining.length === this.data.bindings.length) return false;
    const next: ChatBindingsFile = { schemaVersion: 1, bindings: remaining };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return true;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
