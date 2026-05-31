import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../../src/agent/agent-provider-registry.js";
import { ProviderStore } from "../../../../src/agent/provider-store.js";
import { ConfigStore } from "@infra/app/config-store.js";
import {
  ProviderListCommandHandler,
  ProviderRegisterCommandHandler,
  ProviderUnregisterCommandHandler,
  ProviderUseCommandHandler
} from "@platform/commands/provider/provider-command-handlers.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";

const OWNER_EMAIL = "alice@example.com";
const OWNER = new Set([OWNER_EMAIL]);

const DEFINITION = {
  id: "provider_register",
  command: "/provider register",
  description: "",
  groupKey: "agent",
  action: "cmd:/provider register"
} as const;

function ctx(args: string, overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_test",
    messageId: "om_test",
    sender: { platform: "feishu", userId: "ou_owner", email: OWNER_EMAIL },
    definition: { ...DEFINITION, ...overrides.definition },
    raw: "/provider register",
    args,
    ...overrides
  };
}

describe("provider command handlers", () => {
  let home: string;
  let store: ProviderStore;
  let registry: AgentProviderRegistry;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-provider-cmd-"));
    await writeFile(join(home, "config.jsonc"), `{
  "schemaVersion": 1,
  "failureTarget": null
}
`, "utf8");
    const configStore = await ConfigStore.load(home);
    store = ProviderStore.fromConfig(configStore);
    registry = new AgentProviderRegistry();
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  describe("register", () => {
    it("registers a codex provider when cwd exists", async () => {
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(`codex cwd=${home}`));
      expect(reply).toMatchObject({ kind: "text" });
      expect((reply as { text: string }).text).toContain("codex 已注册");
      expect(store.snapshot().providers).toHaveLength(1);
      expect(registry.available().map((p) => p.kind)).toEqual(["codex"]);
    });

    it("accepts any well-formed kind so users can declare arbitrary CLI labels", async () => {
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(`gemini cwd=${home}`));
      expect((reply as { text: string }).text).toContain("gemini 已注册");
      expect(store.snapshot().providers.map((p) => p.kind)).toEqual(["gemini"]);
    });

    it("rejects kinds with illegal characters so typos surface early", async () => {
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(`bad/kind cwd=${home}`));
      expect((reply as { text: string }).text).toContain("非法 kind");
    });

    it("rejects when cwd is missing", async () => {
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex"));
      expect((reply as { text: string }).text).toContain("cwd");
    });

    it("rejects when cwd path does not exist", async () => {
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex cwd=/does/not/exist"));
      expect((reply as { text: string }).text).toContain("cwd 路径不存在");
    });

    it("rejects when the kind is already registered", async () => {
      await store.upsert({ kind: "codex", cwd: home });
      registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(`codex cwd=${home}`));
      expect((reply as { text: string }).text).toContain("已注册");
    });

    it("rejects unknown field", async () => {
      const handler = new ProviderRegisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(`codex cwd=${home} foo=bar`));
      expect((reply as { text: string }).text).toContain("不识别的字段: foo");
    });
  });

  describe("list", () => {
    it("renders an empty hint when no providers exist", async () => {
      const handler = new ProviderListCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(""));
      expect((reply as { text: string }).text).toContain("尚未注册任何 provider");
    });

    it("marks the active kind with a star and renders common fields", async () => {
      await store.upsert({ kind: "codex", cwd: home, command: "codex", model: "gpt-5" });
      await store.setActive("codex");
      registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
      registry.setActive("codex");
      const handler = new ProviderListCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx(""));
      const text = (reply as { text: string }).text;
      expect(text).toContain("codex ★ active");
      expect(text).toContain("command=codex");
      expect(text).toContain("model=gpt-5");
    });
  });

  describe("use", () => {
    it("activates a registered kind", async () => {
      await store.upsert({ kind: "codex", cwd: home });
      registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
      const handler = new ProviderUseCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex"));
      expect((reply as { text: string }).text).toContain("已设为配置类命令与定时任务的默认 agent");
      expect(registry.activeKindName()).toBe("codex");
      expect(store.snapshot().activeKind).toBe("codex");
    });

    it("rejects use for an unregistered kind", async () => {
      const handler = new ProviderUseCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex"));
      expect((reply as { text: string }).text).toContain("未注册: codex");
    });
  });

  describe("unregister", () => {
    it("removes a registered provider", async () => {
      await store.upsert({ kind: "codex", cwd: home });
      registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
      const handler = new ProviderUnregisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex"));
      expect((reply as { text: string }).text).toContain("已移除");
      expect(registry.available()).toHaveLength(0);
    });

    it("reports activeCleared when unregistering the active provider", async () => {
      await store.upsert({ kind: "codex", cwd: home });
      await store.setActive("codex");
      registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
      registry.setActive("codex");
      const handler = new ProviderUnregisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex"));
      expect((reply as { text: string }).text).toContain("之前是 active，已清空");
      expect(registry.activeKindName()).toBeUndefined();
      expect(store.snapshot().activeKind).toBeNull();
    });

    it("reports not-registered when unregistering an unknown kind", async () => {
      const handler = new ProviderUnregisterCommandHandler({
        ownerEmails: OWNER,
        providers: registry,
        providerStore: store
      });
      const reply = await handler.execute(ctx("codex"));
      expect((reply as { text: string }).text).toContain("未注册: codex");
    });
  });
});
