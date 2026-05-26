import { describe, expect, it } from "vitest";
import { collectContributions, type FeeglePlugin } from "../../src/boot/feegle-plugin.js";

describe("collectContributions", () => {
  it("flattens each plugin's contributions by extension point, preserving order", () => {
    const plugins: FeeglePlugin[] = [
      { id: "a", handlerKinds: [{ id: "k1", register: () => {} }] },
      {
        id: "b",
        handlerKinds: [{ id: "k2", register: () => {} }],
        quoteClients: [{ id: "q1", register: () => {} }]
      }
    ];
    const result = collectContributions(plugins);
    expect(result.handlerKinds.map((m) => m.id)).toEqual(["k1", "k2"]);
    expect(result.quoteClients.map((m) => m.id)).toEqual(["q1"]);
    expect(result.slashCommands).toEqual([]);
  });
});
