import { describe, expect, it } from "vitest";
import { resolveFeegleHome } from "../../src/infra/app/feegle-home.js";

describe("resolveFeegleHome", () => {
  it("uses FEEGLE_HOME when set so tests and deployments can isolate state", () => {
    expect(resolveFeegleHome({ FEEGLE_HOME: "/tmp/feegle-home" })).toBe("/tmp/feegle-home");
  });

  it("defaults to the user's .feegle directory", () => {
    expect(resolveFeegleHome({ HOME: "/Users/alice" })).toBe("/Users/alice/.feegle");
  });
});
