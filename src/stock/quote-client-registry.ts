import type { QuoteClient } from "./stock-quote-port.js";

export class QuoteClientRegistry {
  private readonly clients = new Map<string, QuoteClient>();
  private frozen = false;

  register(id: string, client: QuoteClient): this {
    if (this.frozen) {
      throw new Error("Quote client registry is frozen; register all clients before boot completes");
    }
    if (this.clients.has(id)) {
      throw new Error(`Duplicate quote client: ${id}`);
    }
    this.clients.set(id, client);
    return this;
  }

  freeze(): this {
    this.frozen = true;
    return this;
  }

  get(id: string): QuoteClient | undefined {
    return this.clients.get(id);
  }
}
