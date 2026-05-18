import type { QuoteClient } from "./stock-quote-port.js";

export class QuoteClientRegistry {
  private readonly clients = new Map<string, QuoteClient>();

  register(id: string, client: QuoteClient): this {
    if (this.clients.has(id)) {
      throw new Error(`Duplicate quote client: ${id}`);
    }
    this.clients.set(id, client);
    return this;
  }

  get(id: string): QuoteClient | undefined {
    return this.clients.get(id);
  }
}
