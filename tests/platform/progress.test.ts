import { describe, expect, it } from "vitest";
import { createProgressEvent } from "../../src/platform/progress.js";

describe("createProgressEvent", () => {
  it("normalizes long running work into card-renderable progress state", () => {
    expect(
      createProgressEvent({
        runId: "run_1",
        title: "生成原型",
        status: "running",
        message: "正在分析需求",
        completedSteps: 1,
        totalSteps: 4
      })
    ).toEqual({
      kind: "progress",
      runId: "run_1",
      title: "生成原型",
      status: "running",
      message: "正在分析需求",
      completedSteps: 1,
      totalSteps: 4,
      percent: 25
    });
  });
});
