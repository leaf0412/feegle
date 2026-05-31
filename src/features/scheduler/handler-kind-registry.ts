import type { HandlerKind } from "./handler-kind.js";

export class HandlerKindRegistry {
  private readonly kinds = new Map<string, HandlerKind>();
  private frozen = false;

  register(kind: HandlerKind): this {
    if (this.frozen) {
      throw new Error("Handler kind registry is frozen; register all kinds before boot completes");
    }
    if (this.kinds.has(kind.id)) {
      throw new Error(`Duplicate kind: ${kind.id}`);
    }
    this.kinds.set(kind.id, kind);
    return this;
  }

  freeze(): this {
    this.frozen = true;
    return this;
  }

  get(id: string): HandlerKind | undefined {
    return this.kinds.get(id);
  }

  list(): readonly HandlerKind[] {
    return [...this.kinds.values()];
  }
}
