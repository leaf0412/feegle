import { describe, expect, it, vi } from "vitest";
import {
  createSanitizingLogger,
  installFeishuConsoleLogger,
  sanitizeLogArgs,
  sanitizeLogString,
  shouldSuppressDebug
} from "@integrations/feishu/feishu-logger.js";

describe("sanitizeLogString", () => {
  it("masks sensitive query params while keeping the rest of the URL", () => {
    const masked = sanitizeLogString("connect wss://x?device_id=abcd&conn_id=zz&other=1");
    expect(masked).toBe("connect wss://x?device_id=***&conn_id=***&other=1");
  });

  it("masks bare token assignments separated by spaces", () => {
    expect(sanitizeLogString("token=hunter2 extra")).toBe("token=*** extra");
  });

  it("leaves strings without sensitive params untouched", () => {
    expect(sanitizeLogString("hello world")).toBe("hello world");
  });
});

describe("sanitizeLogArgs", () => {
  it("only rewrites string args, passes non-strings through", () => {
    expect(sanitizeLogArgs(["token=secret", 42, { token: "secret" }])).toEqual([
      "token=***",
      42,
      { token: "secret" }
    ]);
  });
});

describe("shouldSuppressDebug", () => {
  it("flags heartbeat ping/pong lines", () => {
    expect(shouldSuppressDebug(["ws layer: ping success"])).toBe(true);
    expect(shouldSuppressDebug(["socket Receive Pong frame"])).toBe(true);
  });

  it("does not flag normal debug messages", () => {
    expect(shouldSuppressDebug(["sent message", { id: "x" }])).toBe(false);
  });
});

describe("createSanitizingLogger", () => {
  it("forwards info/warn/error after masking but drops heartbeat debug", () => {
    const inner = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger = createSanitizingLogger(inner);

    logger.debug("ping success");
    logger.debug("connect token=secret");
    logger.info("connect device_id=abcd");
    logger.warn("retry");
    logger.error(new Error("boom"));

    expect(inner.debug).toHaveBeenCalledTimes(1);
    expect(inner.debug).toHaveBeenCalledWith("connect token=***");
    expect(inner.info).toHaveBeenCalledWith("connect device_id=***");
    expect(inner.warn).toHaveBeenCalledWith("retry");
    expect(inner.error).toHaveBeenCalledWith(new Error("boom"));
  });
});

describe("installFeishuConsoleLogger", () => {
  it("installs sanitizing behavior into console once", () => {
    const original = {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
    const calls: unknown[][] = [];
    console.debug = (...args: unknown[]) => calls.push(["debug", ...args]);
    console.info = (...args: unknown[]) => calls.push(["info", ...args]);
    console.warn = (...args: unknown[]) => calls.push(["warn", ...args]);
    console.error = (...args: unknown[]) => calls.push(["error", ...args]);

    try {
      installFeishuConsoleLogger();
      installFeishuConsoleLogger();

      console.debug("ping success");
      console.info("connect token=secret");
      console.warn("retry device_id=abcd");

      expect(calls).toEqual([
        ["info", "connect token=***"],
        ["warn", "retry device_id=***"]
      ]);
    } finally {
      delete (console as unknown as Record<symbol, boolean>)[Symbol.for("feegle.feishu.sanitizing-console.installed")];
      console.debug = original.debug;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    }
  });
});
