/**
 * Runtime load state for spreading chat turns across registered agent
 * providers. Holds an in-flight count per provider kind and picks the least
 * busy candidate, rotating on ties so a cold start (all counts zero) spreads
 * sessions instead of stacking them on one agent.
 *
 * Pure and synchronous — counts only, no I/O. The catalog of which providers
 * exist lives in AgentProviderRegistry; this owns load.
 */
export class AgentLoadBalancer {
  private readonly inFlight = new Map<string, number>();
  private rotation = 0;

  select(candidateKinds: string[]): string {
    if (candidateKinds.length === 0) {
      throw new Error("AgentLoadBalancer.select called with no candidates");
    }
    const lowest = Math.min(...candidateKinds.map((kind) => this.inFlightCount(kind)));
    const leastBusy = candidateKinds.filter((kind) => this.inFlightCount(kind) === lowest);
    const chosen = leastBusy[this.rotation % leastBusy.length]!;
    this.rotation += 1;
    return chosen;
  }

  acquire(kind: string): void {
    this.inFlight.set(kind, this.inFlightCount(kind) + 1);
  }

  release(kind: string): void {
    this.inFlight.set(kind, Math.max(0, this.inFlightCount(kind) - 1));
  }

  inFlightCount(kind: string): number {
    return this.inFlight.get(kind) ?? 0;
  }
}
