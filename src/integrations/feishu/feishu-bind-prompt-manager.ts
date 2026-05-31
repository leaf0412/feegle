import type { FeishuClientPort } from "./feishu-client.js";
import { buildBindPromptSupersededCard } from "./feishu-workbench-cards.js";

/**
 * Manages outstanding bind-prompt cards across a chat scope.
 *
 * Tracks prompt cards so they can be swept to an inert "已失效" state once
 * any one binding action completes. In-memory only: lost on restart, at which
 * point a stale card is harmless (re-binding the same url is a DB no-op).
 */
export class FeishuBindPromptManager {
  private readonly outstandingBindPrompts = new Map<string, Set<string>>();

  constructor(private readonly client: FeishuClientPort) {}

  /** Track a new prompt card for the given scope. */
  add(scopeKey: string, messageId: string): void {
    const ids = this.outstandingBindPrompts.get(scopeKey) ?? new Set<string>();
    ids.add(messageId);
    this.outstandingBindPrompts.set(scopeKey, ids);
  }

  /** Stop tracking a prompt card (e.g. user cancelled it). */
  remove(scopeKey: string, messageId: string): void {
    const ids = this.outstandingBindPrompts.get(scopeKey);
    if (!ids) return;
    ids.delete(messageId);
    if (ids.size === 0) {
      this.outstandingBindPrompts.delete(scopeKey);
    }
  }

  /** Returns the set of tracked message ids for a scope, if any. */
  getIds(scopeKey: string): ReadonlySet<string> | undefined {
    return this.outstandingBindPrompts.get(scopeKey);
  }

  /** Whether the given scope has any outstanding prompts. */
  hasScope(scopeKey: string): boolean {
    return this.outstandingBindPrompts.has(scopeKey);
  }

  /**
   * Update every still-outstanding prompt card for a scope to an inert
   * "已失效" state and stop tracking them.
   *
   * @param scopeKey - The scope whose prompts to sweep.
   * @param exceptMessageId - Optional message id to skip (e.g. the card the
   *   user acted on, which gets its own success update via the normal reply).
   */
  async sweep(scopeKey: string, exceptMessageId?: string): Promise<void> {
    const ids = this.outstandingBindPrompts.get(scopeKey);
    if (!ids) return;
    for (const id of ids) {
      if (id === exceptMessageId) continue;
      await this.client.updateInteractiveCard(id, buildBindPromptSupersededCard());
    }
    this.outstandingBindPrompts.delete(scopeKey);
  }
}
