import { describe, expect, it, vi } from "vitest";
import { isTenantAccessTokenInvalid, withTokenRefreshRetry } from "../../src/feishu/feishu-retry.js";

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
