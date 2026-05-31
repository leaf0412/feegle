import type { RuntimeStore } from "../runtime/runtime-store.js";
import type { RuntimeDb } from "../app/runtime-db.js";
import type { StuckRunDetector } from "./stuck-run-detector.js";

export type HealthStatus = "pass" | "warn" | "fail";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthCheck[];
}

export class RuntimeHealthService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly db: RuntimeDb,
    private readonly stuckDetector: StuckRunDetector
  ) {}

  async check(): Promise<HealthReport> {
    const checks: HealthCheck[] = [];

    // DB availability
    try {
      this.db.prepare("select 1").get();
      checks.push({ name: "db_available", status: "pass", detail: "SQLite responsive" });
    } catch {
      checks.push({ name: "db_available", status: "fail", detail: "SQLite unresponsive" });
    }

    // Check stuck running attempts (read-only, no mutation)
    try {
      const nowIso = new Date().toISOString();
      const stuck = this.stuckDetector.detect(nowIso);
      if (stuck.length > 0) {
        checks.push({
          name: "stuck_attempts",
          status: "warn",
          detail: `${stuck.length} running attempts appear stuck: ${stuck.map((s) => s.attemptId).join(", ")}`
        });
      } else {
        checks.push({ name: "stuck_attempts", status: "pass", detail: "no stuck attempts" });
      }
    } catch {
      checks.push({ name: "stuck_attempts", status: "fail", detail: "could not check stuck attempts" });
    }

    const worst = checks.some((c) => c.status === "fail") ? "fail" as const
      : checks.some((c) => c.status === "warn") ? "warn" as const
      : "pass" as const;

    return { status: worst, checks };
  }
}
