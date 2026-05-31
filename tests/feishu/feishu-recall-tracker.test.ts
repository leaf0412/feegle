import { describe, expect, it } from "vitest";
import {
  FeishuRecallTracker,
  isMessageWithdrawnCode,
  isMessageWithdrawnError
} from "@integrations/feishu/feishu-recall-tracker.js";

describe("isMessageWithdrawnCode", () => {
  it("recognises Feishu code 230011 directly", () => {
    expect(isMessageWithdrawnCode(230011, "")).toBe(true);
  });

  it("matches withdrawal phrases case-insensitively in the message", () => {
    expect(isMessageWithdrawnCode(0, "message was Recalled")).toBe(true);
    expect(isMessageWithdrawnCode(0, "已被撤回")).toBe(true);
    expect(isMessageWithdrawnCode(0, "Message not found")).toBe(true);
    expect(isMessageWithdrawnCode(0, "rate limit")).toBe(false);
  });
});

describe("isMessageWithdrawnError", () => {
  it("classifies errors whose message looks like a recall", () => {
    expect(isMessageWithdrawnError(new Error("message has been recalled"))).toBe(true);
    expect(isMessageWithdrawnError(new Error("internal"))).toBe(false);
    expect(isMessageWithdrawnError(undefined)).toBe(false);
  });
});

describe("FeishuRecallTracker", () => {
  it("marks and reports recalled messages until the TTL elapses", () => {
    let now = 1_000_000;
    const tracker = new FeishuRecallTracker({ ttlMs: 60_000, now: () => now });

    expect(tracker.isRecalled("om_1")).toBe(false);
    tracker.mark("om_1");
    expect(tracker.isRecalled("om_1")).toBe(true);

    now += 30_000;
    expect(tracker.isRecalled("om_1")).toBe(true);

    now += 31_000;
    expect(tracker.isRecalled("om_1")).toBe(false);
  });

  it("ignores empty ids and trims whitespace", () => {
    const tracker = new FeishuRecallTracker();
    tracker.mark("");
    tracker.mark("   ");
    tracker.mark("  om_a  ");
    expect(tracker.isRecalled("om_a")).toBe(true);
    expect(tracker.isRecalled("")).toBe(false);
  });
});
