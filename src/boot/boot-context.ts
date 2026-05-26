import type { Capabilities } from "./capabilities.js";

/**
 * A typed accumulator for capabilities, filled phase by phase during boot.
 * `provide` registers a capability once; `require` fetches it (throwing at the
 * boundary if not yet provided — a programmer error caught immediately).
 */
export class BootContext {
  private readonly caps = new Map<keyof Capabilities, unknown>();

  provide<K extends keyof Capabilities>(key: K, value: Capabilities[K]): void {
    if (this.caps.has(key)) {
      throw new Error(`capability already provided: ${String(key)}`);
    }
    this.caps.set(key, value);
  }

  require<K extends keyof Capabilities>(key: K): Capabilities[K] {
    if (!this.caps.has(key)) {
      throw new Error(`capability not ready: ${String(key)}`);
    }
    return this.caps.get(key) as Capabilities[K];
  }

  pick<K extends keyof Capabilities>(...keys: K[]): Pick<Capabilities, K> {
    const slice = {} as Pick<Capabilities, K>;
    for (const key of keys) {
      slice[key] = this.require(key);
    }
    return slice;
  }
}

/** Read-only view handed to module/plugin code. */
export type CapabilityContext = Pick<BootContext, "require" | "pick">;
