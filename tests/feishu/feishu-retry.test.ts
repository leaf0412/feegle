import { describe, expect, it, vi } from "vitest";
import {
  isTenantAccessTokenInvalid,
  isTransientError,
  withTokenRefreshRetry,
  withTransientRetry
} from "@integrations/feishu/feishu-retry.js";

describe("isTenantAccessTokenInvalid", () => {
  it("recognises Feishu code 99991663", () => {
    expect(isTenantAccessTokenInvalid(new Error("API failed: code=99991663 msg=invalid"))).toBe(true);
  });

  it("recognises the invalid-access-token phrase case-insensitively", () => {
    expect(isTenantAccessTokenInvalid(new Error("Invalid Access Token"))).toBe(true);
    expect(isTenantAccessTokenInvalid(new Error("tenant access token is invalid here"))).toBe(false);
  });

  it("returns false for unrelated errors and non-errors", () => {
    expect(isTenantAccessTokenInvalid(new Error("rate limited"))).toBe(false);
    expect(isTenantAccessTokenInvalid(undefined)).toBe(false);
    expect(isTenantAccessTokenInvalid("some string")).toBe(false);
  });
});

describe("withTokenRefreshRetry", () => {
  it("returns the result when the operation succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const refresh = vi.fn();

    const result = await withTokenRefreshRetry(fn, { refresh });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes the token and retries once when the first call fails with invalid token", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("code=99991663 invalid access token"))
      .mockResolvedValueOnce("ok");

    const result = await withTokenRefreshRetry(fn, { refresh });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original error when the refresh call itself fails", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("refresh down"));
    const fn = vi.fn().mockRejectedValue(new Error("99991663 invalid access token"));

    await expect(withTokenRefreshRetry(fn, { refresh, operation: "patch" })).rejects.toThrow(
      /patch failed after token refresh attempt: refresh down/
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on errors unrelated to the access token", async () => {
    const refresh = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error("rate limited"));

    await expect(withTokenRefreshRetry(fn, { refresh })).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("only retries once even if the second call also fails with invalid token", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("99991663"))
      .mockRejectedValueOnce(new Error("99991663"));

    await expect(withTokenRefreshRetry(fn, { refresh })).rejects.toThrow("99991663");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientError", () => {
  it("detects Node syscall codes that retry safely", () => {
    expect(isTransientError(makeErrorWithCode("ECONNRESET"))).toBe(true);
    expect(isTransientError(makeErrorWithCode("EPIPE"))).toBe(true);
    expect(isTransientError(makeErrorWithCode("ETIMEDOUT"))).toBe(true);
    expect(isTransientError(makeErrorWithCode("EAI_AGAIN"))).toBe(true);
  });

  it("detects message substrings that the Feishu SDK emits", () => {
    expect(isTransientError(new Error("read ECONNRESET: connection reset by peer"))).toBe(true);
    expect(isTransientError(new Error("write EPIPE broken pipe"))).toBe(true);
    expect(isTransientError(new Error("dial tcp: i/o timeout"))).toBe(true);
    expect(isTransientError(new Error("TLS handshake timeout"))).toBe(true);
    expect(isTransientError(new Error("server misbehaving"))).toBe(true);
    expect(isTransientError(new Error("connection refused"))).toBe(true);
  });

  it("returns false for application-level errors and non-errors", () => {
    expect(isTransientError(new Error("code=230020 message recalled"))).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError("ECONNRESET")).toBe(false);
  });
});

describe("withTransientRetry", () => {
  it("returns the result without retrying when the operation succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn();
    await expect(withTransientRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient errors with exponential backoff and jitter", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeErrorWithCode("ECONNRESET"))
      .mockRejectedValueOnce(new Error("dial tcp: i/o timeout"))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    const random = vi.fn().mockReturnValue(0);

    await expect(
      withTransientRetry(fn, {
        sleep,
        random,
        initialDelayMs: 100,
        maxDelayMs: 2_000,
        maxRetries: 3
      })
    ).resolves.toBe("ok");

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("stops retrying on non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("rate limited"));
    const sleep = vi.fn();
    await expect(withTransientRetry(fn, { sleep })).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("surfaces the last error after exhausting maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue(makeErrorWithCode("ECONNRESET"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withTransientRetry(fn, { sleep, random: () => 0, initialDelayMs: 10, maxRetries: 2, operation: "send" })
    ).rejects.toThrow("send failed after 2 retries");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("aborts via AbortSignal while waiting between retries", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(makeErrorWithCode("ECONNRESET"));
    const sleep = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve();
    });

    await expect(
      withTransientRetry(fn, { sleep, random: () => 0, signal: controller.signal, initialDelayMs: 5 })
    ).rejects.toThrow(/aborted/i);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

function makeErrorWithCode(code: string): Error {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}
