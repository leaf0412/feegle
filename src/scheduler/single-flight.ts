export class SingleFlight {
  private readonly running = new Set<string>();

  tryAcquire(taskId: string): boolean {
    if (this.running.has(taskId)) {
      return false;
    }
    this.running.add(taskId);
    return true;
  }

  release(taskId: string): void {
    this.running.delete(taskId);
  }
}
