import { describe, expect, it } from "vitest";
import {
  createProgressEvent,
  type PlatformProgressEntry,
  type PlatformProgressSnapshot
} from "../../src/platform/progress.js";

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

describe("PlatformProgressSnapshot tool_step entries", () => {
  it("accepts a fully-structured tool step entry alongside the existing kinds", () => {
    const entry: PlatformProgressEntry = {
      kind: "tool_step",
      name: "Bash",
      summary: "ls -la",
      status: "ok",
      exitCode: 0,
      input: "ls -la",
      result: "total 0",
      elapsedMs: 1200
    };
    const snapshot: PlatformProgressSnapshot = {
      title: "Working",
      state: "running",
      truncated: false,
      entries: [entry],
      streaming: true,
      elapsedMs: 1200
    };
    expect(snapshot.entries[0]).toEqual(entry);
    expect(snapshot.streaming).toBe(true);
    expect(snapshot.elapsedMs).toBe(1200);
  });
});
