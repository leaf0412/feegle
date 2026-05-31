import {
  NotificationTargetSchema,
  type ConfigStoreProviderWriter,
  type FeegleConfig
} from "@infra/app/config-store.js";

/**
 * Test-only fake of ConfigStoreProviderWriter. Tracks `agent.providers` and `agent.default` in
 * memory so boot-integration / feegle-app tests that don't exercise on-disk JSONC editing still
 * satisfy the writer contract. Writer mutations are intentionally minimal — they exist mainly so
 * the migration step in stores-phase can write providers without crashing.
 */
export function fakeConfigStore(initial?: Partial<FeegleConfig>): ConfigStoreProviderWriter {
  let data: FeegleConfig = {
    schemaVersion: 1,
    failureTarget: null,
    // Boot tests run the full providers phase which now requires gitlab.workspace.
    // Provide a minimal fake gitlab config so tests that don't override it still pass.
    gitlab: {
      token: "fake-token",
      secretRef: "",
      host: "fake.gitlab.example",
      workspace: "/tmp/fake-workspace"
    },
    ...initial
  };
  return {
    get: () => structuredClone(data),
    setFailureTarget: async (target) => {
      const validated = target ? NotificationTargetSchema.parse(target) : null;
      data = { ...data, failureTarget: validated };
    },
    setAgentProvider: async (kind, record) => {
      const agent = data.agent ?? { default: null, providers: {} };
      data = {
        ...data,
        agent: { ...agent, providers: { ...agent.providers, [kind]: { ...record } } }
      };
    },
    setAgentDefault: async (kind) => {
      const agent = data.agent ?? { default: null, providers: {} };
      data = { ...data, agent: { ...agent, default: kind } };
    },
    removeAgentProvider: async (kind) => {
      const agent = data.agent ?? { default: null, providers: {} };
      const wasActive = agent.default === kind;
      const { [kind]: _removed, ...rest } = agent.providers;
      data = {
        ...data,
        agent: { ...agent, providers: rest, default: wasActive ? null : agent.default }
      };
      return { activeCleared: wasActive };
    }
  };
}
