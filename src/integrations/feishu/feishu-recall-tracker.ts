const DEFAULT_RECALL_TTL_MS = 60 * 60 * 1000;

const WITHDRAWN_MESSAGE_NEEDLES = [
  "withdrawn",
  "recalled",
  "recall",
  "deleted",
  "not found",
  "not exist",
  "撤回"
];

export function isMessageWithdrawnCode(code: number, message: string): boolean {
  if (code === 230011) {
    return true;
  }
  const normalized = message.trim().toLowerCase();
  return WITHDRAWN_MESSAGE_NEEDLES.some((needle) => normalized.includes(needle));
}

export function isMessageWithdrawnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return isMessageWithdrawnCode(0, error.message);
}

export interface FeishuRecallTrackerOptions {
  ttlMs?: number;
  now?: () => number;
}

export class FeishuRecallTracker {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: FeishuRecallTrackerOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_RECALL_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  mark(messageId: string): void {
    const id = messageId.trim();
    if (id === "") {
      return;
    }
    this.evictExpired();
    this.entries.set(id, this.now());
  }

  isRecalled(messageId: string): boolean {
    const id = messageId.trim();
    if (id === "") {
      return false;
    }
    const markedAt = this.entries.get(id);
    if (markedAt === undefined) {
      return false;
    }
    if (this.now() - markedAt > this.ttlMs) {
      this.entries.delete(id);
      return false;
    }
    return true;
  }

  private evictExpired(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, markedAt] of this.entries) {
      if (markedAt <= cutoff) {
        this.entries.delete(id);
      }
    }
  }
}
