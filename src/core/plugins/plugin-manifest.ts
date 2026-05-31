import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import type { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";

/** A manifest declares a plugin's capability contract: what surfaces it exposes. */
export interface PluginManifest {
  /** Must match the plugin's `id`. */
  id: string;
  /** Semver version of this manifest. */
  version: string;
  /** Human-readable name for diagnostics and UIs. */
  displayName: string;
  /** Optional description of the plugin's purpose. */
  description?: string;
  /** Trigger types this plugin sources (e.g. "message", "heartbeat"). */
  triggerTypes?: string[];
  /** Effect types this plugin handles, keyed by `pluginId:effectType`. */
  effectTypes?: Array<{ pluginId: string; effectType: string }>;
  /** Intent kinds this plugin resolves (e.g. "chat", "workflow_signal"). */
  intentKinds?: string[];
  /** Control action types this plugin handles. */
  controlActionTypes?: string[];
  /** Permissions the plugin requires. */
  permissions?: string[];
  /** Secret references (env var names) the plugin needs. */
  secretRefs?: string[];
  /** Resource scopes the plugin accesses. */
  resourceScopes?: string[];
}

export interface ManifestValidationIssue {
  level: "error" | "warning";
  pluginId: string;
  message: string;
}

/**
 * Validate manifests declared by plugins.
 *
 * - Missing manifests produce a warning (optional).
 * - Two plugins claiming the same un-namespaced capability is an error.
 * - Other structural issues are collected as errors or warnings.
 */
export function validatePluginManifests(
  plugins: readonly FeeglePlugin[]
): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];

  // Index plugins that have manifests
  const manifestMap = new Map<string, PluginManifest>();
  for (const plugin of plugins) {
    if (plugin.manifest) {
      manifestMap.set(plugin.id, plugin.manifest);
    } else {
      issues.push({
        level: "warning",
        pluginId: plugin.id,
        message: `Plugin "${plugin.id}" has no manifest — capability contract not enforced`
      });
    }
  }

  // Check duplicate un-namespaced capabilities across manifests
  // effectTypes keyed by "pluginId:effectType" are already namespaced — safe
  // triggerTypes, intentKinds, controlActionTypes could overlap

  checkDuplicateTriggers(manifestMap, issues);
  checkDuplicateIntentKinds(manifestMap, issues);
  checkDuplicateControlActions(manifestMap, issues);

  // Structural validation: manifest.id must match plugin.id
  for (const [pluginId, manifest] of manifestMap) {
    if (manifest.id !== pluginId) {
      issues.push({
        level: "error",
        pluginId,
        message: `Manifest id "${manifest.id}" does not match plugin id "${pluginId}"`
      });
    }
    if (!manifest.version) {
      issues.push({
        level: "error",
        pluginId,
        message: `Manifest for "${pluginId}" is missing a version`
      });
    }
    if (!manifest.displayName) {
      issues.push({
        level: "error",
        pluginId,
        message: `Manifest for "${pluginId}" is missing displayName`
      });
    }
  }

  return issues;
}

function checkDuplicateTriggers(
  manifestMap: Map<string, PluginManifest>,
  issues: ManifestValidationIssue[]
): void {
  const seen = new Map<string, string>(); // triggerType → pluginId
  for (const [, manifest] of manifestMap) {
    for (const trigger of manifest.triggerTypes ?? []) {
      if (seen.has(trigger)) {
        issues.push({
          level: "error",
          pluginId: manifest.id,
          message: `Trigger type "${trigger}" already claimed by plugin "${seen.get(trigger)}"`
        });
      } else {
        seen.set(trigger, manifest.id);
      }
    }
  }
}

function checkDuplicateIntentKinds(
  manifestMap: Map<string, PluginManifest>,
  issues: ManifestValidationIssue[]
): void {
  const seen = new Map<string, string>(); // intentKind → pluginId
  for (const [, manifest] of manifestMap) {
    for (const intentKind of manifest.intentKinds ?? []) {
      if (seen.has(intentKind)) {
        issues.push({
          level: "warning",
          pluginId: manifest.id,
          message: `Intent kind "${intentKind}" also declared by plugin "${seen.get(intentKind)}" (shared intent kinds are allowed)`
        });
      } else {
        seen.set(intentKind, manifest.id);
      }
    }
  }
}

function checkDuplicateControlActions(
  manifestMap: Map<string, PluginManifest>,
  issues: ManifestValidationIssue[]
): void {
  const seen = new Map<string, string>(); // controlActionType → pluginId
  for (const [, manifest] of manifestMap) {
    for (const action of manifest.controlActionTypes ?? []) {
      if (seen.has(action)) {
        issues.push({
          level: "error",
          pluginId: manifest.id,
          message: `Control action type "${action}" already claimed by plugin "${seen.get(action)}"`
        });
      } else {
        seen.set(action, manifest.id);
      }
    }
  }
}

/**
 * Validate that registered effect handlers are declared in a plugin's manifest.
 * Only checks plugins that HAVE manifests; plugins without manifests are skipped.
 */
export function validateEffectDeclarations(
  effectHandlers: EffectHandlerRegistry,
  plugins: readonly FeeglePlugin[]
): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];

  const manifestByPluginId = new Map<string, PluginManifest>();
  for (const plugin of plugins) {
    if (plugin.manifest) {
      manifestByPluginId.set(plugin.id, plugin.manifest);
    }
  }

  // Build set of all declared effect keys for quick lookup
  const declaredEffects = new Set<string>();
  for (const [, manifest] of manifestByPluginId) {
    for (const eff of manifest.effectTypes ?? []) {
      declaredEffects.add(`${eff.pluginId}:${eff.effectType}`);
    }
  }

  for (const handler of effectHandlers.list()) {
    const key = `${handler.pluginId}:${handler.effectType}`;
    // Only flag if the owning plugin has a manifest (skip plugins without manifests)
    if (manifestByPluginId.has(handler.pluginId) && !declaredEffects.has(key)) {
      issues.push({
        level: "error",
        pluginId: handler.pluginId,
        message: `Effect "${key}" is registered but not declared in plugin manifest`
      });
    }
  }

  return issues;
}
