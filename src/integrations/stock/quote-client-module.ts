import type { QuoteClientRegistry } from "./quote-client-registry.js";

export interface QuoteClientModule {
  readonly id: string;
  register(registry: QuoteClientRegistry): void;
}
