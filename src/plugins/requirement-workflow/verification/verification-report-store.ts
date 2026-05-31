import type { VerificationReport } from "./verification-models.js";

export class VerificationReportStore {
  private readonly reports = new Map<string, VerificationReport>();

  save(report: VerificationReport): void {
    this.reports.set(report.requirementId, { ...report });
  }

  latest(requirementId: string): VerificationReport | undefined {
    const stored = this.reports.get(requirementId);
    if (stored === undefined) {
      return undefined;
    }
    return { ...stored };
  }
}
