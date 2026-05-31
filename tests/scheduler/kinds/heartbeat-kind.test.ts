import { describe, expect, it } from "vitest";
import { HeartbeatKind } from "../../../src/features/scheduler/kinds/heartbeat-kind.js";
import type { Task } from "../../../src/features/scheduler/task.js";
import { createTaskContext } from "./kind-test-helpers.js";

describe("HeartbeatKind", () => {
  it("sends a status card when target is configured", async () => {
    const notify = recordingNotify();
    const kind = new HeartbeatKind({
      taskRegistry: { list: () => [task("a", true), task("b", false)] }
    });
    const ctx = createTaskContext({ task: task("a", true, { platform: "feishu", chatId: "oc_1" }), notify });

    await expect(kind.run(ctx, kind.parseParams({}))).resolves.toEqual({ outcome: "sent" });

    expect(JSON.stringify(notify.cards[0])).toContain("feegle heartbeat");
    expect(JSON.stringify(notify.cards[0])).toContain("1 enabled / 1 disabled");
  });

  it("returns noop when no target is configured", async () => {
    const kind = new HeartbeatKind({ taskRegistry: { list: () => [] } });
    await expect(kind.run(createTaskContext({ task: task("a") }), kind.parseParams({}))).resolves.toEqual({
      outcome: "noop",
      note: "no target"
    });
  });
});

function recordingNotify() {
  return {
    cards: [] as unknown[],
    async sendText() {},
    async sendCard(_target: unknown, card: unknown) {
      this.cards.push(card);
    }
  };
}

function task(id: string, enabled = true, target: Task["target"] = null): Task {
  return {
    id,
    name: id,
    kind: "heartbeat",
    params: {},
    cron: "0 9 * * *",
    timezone: "Asia/Shanghai",
    activeHours: null,
    target,
    enabled,
    source: "seed",
    errorPolicy: "on-change",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    lastRun: null,
    consecutiveFailures: 0,
    lastErrorNotifiedAt: null
  };
}
