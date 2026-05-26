import { describe, expect, it } from "vitest";
import { BootContext } from "../../src/boot/boot-context.js";
import type { BootPhase } from "../../src/boot/boot-phase.js";
import { BootAbortError } from "../../src/boot/boot-phase.js";
import { runBoot } from "../../src/boot/run-boot.js";

function phase(name: BootPhase["name"], run: () => Promise<void>): BootPhase {
  return { name, run };
}

describe("runBoot", () => {
  it("runs phases in order and reports each as ok", async () => {
    const order: string[] = [];
    const report = await runBoot(
      [
        phase("infra", async () => void order.push("infra")),
        phase("stores", async () => void order.push("stores"))
      ],
      new BootContext()
    );
    expect(order).toEqual(["infra", "stores"]);
    expect(report.phases.map((p) => p.status)).toEqual(["ok", "ok"]);
  });

  it("aborts on the first failing phase and names it", async () => {
    const order: string[] = [];
    await expect(
      runBoot(
        [
          phase("infra", async () => void order.push("infra")),
          phase("stores", async () => {
            throw new Error("db locked");
          }),
          phase("providers", async () => void order.push("providers"))
        ],
        new BootContext()
      )
    ).rejects.toMatchObject({ name: "BootAbortError", phase: "stores" });
    expect(order).toEqual(["infra"]); // providers never ran
  });

  it("records the failed phase in the abort error report", async () => {
    try {
      await runBoot(
        [
          phase("infra", async () => {
            throw new Error("boom");
          })
        ],
        new BootContext()
      );
      throw new Error("expected runBoot to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BootAbortError);
      const abort = error as BootAbortError;
      expect(abort.report.at(-1)).toMatchObject({ phase: "infra", status: "failed" });
    }
  });
});
