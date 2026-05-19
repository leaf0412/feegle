import { describe, expect, it } from "vitest";
import { VersionCommandHandler } from "../../../src/platform/commands/system/version-command.js";

describe("VersionCommandHandler", () => {
  it("reports feegle version from package.json so /version surfaces what's actually deployed", async () => {
    const handler = new VersionCommandHandler();
    const reply = await handler.execute();

    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toMatch(/^feegle \d+\.\d+\.\d+/);
  });

  it("appends short git sha when FEEGLE_GIT_SHA is set so ops can identify the running commit", async () => {
    const prev = process.env.FEEGLE_GIT_SHA;
    process.env.FEEGLE_GIT_SHA = "abc1234deadbeef";
    try {
      const handler = new VersionCommandHandler();
      const reply = await handler.execute();
      if (reply.kind !== "text") throw new Error("expected text reply");
      expect(reply.text).toContain("(abc1234)");
    } finally {
      if (prev === undefined) delete process.env.FEEGLE_GIT_SHA;
      else process.env.FEEGLE_GIT_SHA = prev;
    }
  });
});
