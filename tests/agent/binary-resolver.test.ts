import { describe, expect, it } from "vitest";
import { resolveBinary } from "@integrations/agent/binary-resolver.js";
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("resolveBinary", () => {
  it("resolves a bare name via which when the binary is on PATH", () => {
    const resolved = resolveBinary("node");
    expect(resolved).toBeTruthy();
    expect(resolved).not.toBe("node");
    expect(resolved).toContain("node");
  });

  it("throws when which cannot resolve the bare name", () => {
    expect(() => resolveBinary("feegle_nonexistent_binary_xyz")).toThrow(
      /not found on PATH/i
    );
  });

  it("returns the same path when the command is an existing executable path", () => {
    const resolved = resolveBinary(process.execPath);
    expect(resolved).toBe(process.execPath);
  });

  it("throws when the command is a path that does not exist", () => {
    expect(() => resolveBinary("/tmp/feegle_nonexistent_binary")).toThrow(
      /not found or not executable/i
    );
  });

  it("throws when the command is a path that is not executable", () => {
    const dir = mkdtempSync(join(tmpdir(), "feegle-test-"));
    const file = join(dir, "not-executable");
    writeFileSync(file, "#!/bin/sh\necho nope\n");
    chmodSync(file, 0o644);
    try {
      expect(() => resolveBinary(file)).toThrow(/not found or not executable/i);
    } finally {
      // Clean up — chmod then unlink to avoid EACCES on tmp dir cleanup
      chmodSync(file, 0o644);
    }
  });
});
