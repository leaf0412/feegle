import { describe, expect, it } from "vitest";
import { SingleFlight } from "@features/scheduler/single-flight.js";

describe("SingleFlight", () => {
  it("does not queue duplicate task runs", () => {
    const flight = new SingleFlight();

    expect(flight.tryAcquire("task-1")).toBe(true);
    expect(flight.tryAcquire("task-1")).toBe(false);
    flight.release("task-1");
    expect(flight.tryAcquire("task-1")).toBe(true);
  });
});
