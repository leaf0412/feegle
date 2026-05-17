export class FeishuMessageDedup {
  private readonly handled = new Set<string>();

  mark(messageId: string): boolean {
    if (!messageId) {
      return true;
    }
    if (this.handled.has(messageId)) {
      return false;
    }
    this.handled.add(messageId);
    return true;
  }
}

export function isAllowedByList(allowList: string, value: string): boolean {
  const normalized = allowList.trim();
  if (normalized === "" || normalized === "*") {
    return true;
  }
  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(value);
}

export function isOldMessage(createTimeMs: string | undefined, now = Date.now()): boolean {
  if (!createTimeMs) {
    return false;
  }

  const parsed = Number(createTimeMs);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return parsed < now - 60_000;
}
