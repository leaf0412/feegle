export class UndeliveredFailureCounter {
  private readonly counts = new Map<string, number>();

  increment(taskId: string): number {
    const next = this.get(taskId) + 1;
    this.counts.set(taskId, next);
    return next;
  }

  get(taskId: string): number {
    return this.counts.get(taskId) ?? 0;
  }
}
