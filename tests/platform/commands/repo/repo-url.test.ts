import { describe, expect, it } from "vitest";
import { deriveRepositoryName } from "../../../../src/platform/commands/repo/repo-url.js";

describe("deriveRepositoryName", () => {
  it("takes the last path segment", () => {
    expect(deriveRepositoryName("https://www.lejuhub.com/pc/kuavo-model-training")).toBe("kuavo-model-training");
  });
  it("strips a .git suffix and trailing slash", () => {
    expect(deriveRepositoryName("https://x/y/repo.git")).toBe("repo");
    expect(deriveRepositoryName("https://x/y/repo/")).toBe("repo");
  });
});
