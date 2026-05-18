import { describe, expect, it } from "vitest";
import { buildQuoteClientRegistry } from "../../src/stock/build-quote-client-registry.js";
import type { QuoteClient } from "../../src/stock/stock-quote-port.js";

describe("buildQuoteClientRegistry", () => {
  it("lets external modules register quote clients without editing the app entry", () => {
    const client: QuoteClient = { query: async () => [] };
    const registry = buildQuoteClientRegistry({
      modules: [
        {
          id: "external",
          register: (target) => {
            target.register("external", client);
          }
        }
      ]
    });

    expect(registry.get("external")).toBe(client);
  });

  it("freezes after build so runtime cannot register additional quote clients", () => {
    const registry = buildQuoteClientRegistry();
    expect(() => registry.register("late", { query: async () => [] })).toThrow(/frozen/);
  });
});
