import { describe, expect, it } from "vitest";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import {
  validatePluginManifests,
  validateEffectDeclarations,
  type PluginManifest,
  type ManifestValidationIssue
} from "@core/plugins/plugin-manifest.js";
import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";

function plugin(
  id: string,
  manifest?: PluginManifest,
  opts?: { runtimeContributions?: FeeglePlugin["runtimeContributions"] }
): FeeglePlugin {
  return { id, manifest, ...opts };
}

function manifest(
  id: string,
  overrides?: Partial<PluginManifest>
): PluginManifest {
  return {
    id,
    version: "1.0.0",
    displayName: id,
    ...overrides
  };
}

describe("validatePluginManifests", () => {
  it("passes validation for a valid manifest", () => {
    const plugins: FeeglePlugin[] = [
      plugin("core", manifest("core", { triggerTypes: ["heartbeat"], effectTypes: [] }))
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("warns for plugins without a manifest", () => {
    const plugins: FeeglePlugin[] = [
      plugin("no-manifest")
    ];
    const issues = validatePluginManifests(plugins);
    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.length).toBe(1);
    expect(warnings[0].pluginId).toBe("no-manifest");
    expect(warnings[0].message).toContain("no manifest");
  });

  it("fails if manifest.id does not match plugin.id", () => {
    const plugins: FeeglePlugin[] = [
      plugin("real-id", manifest("wrong-id"))
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes("does not match plugin id"))).toBe(true);
  });

  it("fails if manifest is missing version", () => {
    const plugins: FeeglePlugin[] = [
      plugin("p", { id: "p", version: "", displayName: "P" })
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.message.includes("missing a version"))).toBe(true);
  });

  it("fails if manifest is missing displayName", () => {
    const plugins: FeeglePlugin[] = [
      plugin("p", { id: "p", version: "1.0.0", displayName: "" })
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.message.includes("missing displayName"))).toBe(true);
  });

  it("fails when two plugins claim the same un-namespaced trigger type", () => {
    const plugins: FeeglePlugin[] = [
      plugin("a", manifest("a", { triggerTypes: ["message"] })),
      plugin("b", manifest("b", { triggerTypes: ["message"] }))
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.message.includes("Trigger type") && e.message.includes("already claimed"))).toBe(true);
  });

  it("fails when two plugins claim the same un-namespaced control action type", () => {
    const plugins: FeeglePlugin[] = [
      plugin("a", manifest("a", { controlActionTypes: ["approve"] })),
      plugin("b", manifest("b", { controlActionTypes: ["approve"] }))
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.message.includes("Control action type") && e.message.includes("already claimed"))).toBe(true);
  });

  it("warns (not errors) when two plugins declare the same intent kind", () => {
    const plugins: FeeglePlugin[] = [
      plugin("a", manifest("a", { intentKinds: ["chat"] })),
      plugin("b", manifest("b", { intentKinds: ["chat"] }))
    ];
    const issues = validatePluginManifests(plugins);
    const intentIssues = issues.filter((i) => i.message.includes("Intent kind"));
    expect(intentIssues.every((i) => i.level === "warning")).toBe(true);
  });

  it("collects multiple issues without throwing", () => {
    const plugins: FeeglePlugin[] = [
      plugin("a", manifest("a", { triggerTypes: ["t1"] })),
      plugin("b", manifest("b", { triggerTypes: ["t1"] })),
      plugin("c", manifest("c", { controlActionTypes: ["act"] })),
      plugin("d", manifest("d", { controlActionTypes: ["act"] })),
      plugin("e") // no manifest
    ];
    const issues = validatePluginManifests(plugins);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    // All errors and warnings collected, no throw
  });

  it("passes with unique triggers across plugins", () => {
    const plugins: FeeglePlugin[] = [
      plugin("a", manifest("a", { triggerTypes: ["message"] })),
      plugin("b", manifest("b", { triggerTypes: ["heartbeat"] })),
      plugin("c", manifest("c", { triggerTypes: ["webhook"] }))
    ];
    const issues = validatePluginManifests(plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });
});

describe("validateEffectDeclarations", () => {
  it("passes when all registered effects are declared", () => {
    const registry = new EffectHandlerRegistry();
    registry.register({ pluginId: "core", effectType: "agent_prompt", execute: () => ({}) });

    const plugins: FeeglePlugin[] = [
      plugin("core", manifest("core", {
        effectTypes: [{ pluginId: "core", effectType: "agent_prompt" }]
      }))
    ];

    const issues = validateEffectDeclarations(registry, plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("fails when a plugin registers an undeclared effect", () => {
    const registry = new EffectHandlerRegistry();
    registry.register({ pluginId: "core", effectType: "undeclared_effect", execute: () => ({}) });

    const plugins: FeeglePlugin[] = [
      plugin("core", manifest("core", {
        effectTypes: [{ pluginId: "core", effectType: "declared_only" }]
      }))
    ];

    const issues = validateEffectDeclarations(registry, plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("core:undeclared_effect");
    expect(errors[0].message).toContain("not declared");
  });

  it("skips plugins that have no manifest", () => {
    const registry = new EffectHandlerRegistry();
    registry.register({ pluginId: "unknown", effectType: "mystery", execute: () => ({}) });

    // Plugin "unknown" has no manifest — should be skipped
    const plugins: FeeglePlugin[] = [
      plugin("unknown") // no manifest
    ];

    const issues = validateEffectDeclarations(registry, plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("checks only effects whose plugin has a manifest", () => {
    const registry = new EffectHandlerRegistry();
    registry.register({ pluginId: "core", effectType: "known", execute: () => ({}) });
    registry.register({ pluginId: "legacy", effectType: "old_effect", execute: () => ({}) });

    const plugins: FeeglePlugin[] = [
      plugin("core", manifest("core", {
        effectTypes: [{ pluginId: "core", effectType: "known" }]
      })),
      plugin("legacy") // no manifest — skip
    ];

    const issues = validateEffectDeclarations(registry, plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("handles empty registries and manifests gracefully", () => {
    const registry = new EffectHandlerRegistry();
    const plugins: FeeglePlugin[] = [
      plugin("core", manifest("core", { effectTypes: [] }))
    ];
    const issues = validateEffectDeclarations(registry, plugins);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("catches undeclared effects alongside valid ones", () => {
    const registry = new EffectHandlerRegistry();
    registry.register({ pluginId: "core", effectType: "good", execute: () => ({}) });
    registry.register({ pluginId: "core", effectType: "bad", execute: () => ({}) });

    const plugins: FeeglePlugin[] = [
      plugin("core", manifest("core", {
        effectTypes: [{ pluginId: "core", effectType: "good" }]
      }))
    ];

    const issues = validateEffectDeclarations(registry, plugins);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("core:bad");
  });
});
