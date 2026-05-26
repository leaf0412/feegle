import type { BootContext } from "./boot-context.js";
import { BootAbortError, type BootPhase, type BootReport, type PhaseResult } from "./boot-phase.js";

/**
 * Runs boot phases in order. Default-fatal: the first phase to throw aborts the
 * boot with a `BootAbortError` naming the phase. Records per-phase timing and
 * status for the boot report.
 */
export async function runBoot(phases: readonly BootPhase[], ctx: BootContext): Promise<BootReport> {
  const results: PhaseResult[] = [];
  const bootStartedAt = performance.now();
  for (const phase of phases) {
    const startedAt = performance.now();
    try {
      await phase.run(ctx);
      const durationMs = Math.round(performance.now() - startedAt);
      results.push({ phase: phase.name, status: "ok", durationMs });
      console.log(`[boot] ${phase.name} ✓ ${durationMs}ms`);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      results.push({ phase: phase.name, status: "failed", durationMs, error: String(error) });
      console.error(`[boot] ${phase.name} ✗ ${error}`);
      throw new BootAbortError(phase.name, error, results);
    }
  }
  const totalMs = Math.round(performance.now() - bootStartedAt);
  console.log(`[boot] ready in ${totalMs}ms`);
  return { phases: results, totalMs };
}
