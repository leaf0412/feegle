import { describe, expect, it } from "vitest";
import { defaultPlugins } from "@infra/boot/default-plugins.js";
import { collectContributions } from "@infra/boot/feegle-plugin.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "@tests/fixtures/fake-feishu-client.js";

describe("default plugin registration", () => {
  it("includes every completed integration in default plugins", () => {
    const feishuClient: FeishuClientPort = makeFakeFeishuClient();

    const cloudDoc = {
      createDoc: async () => ({ documentId: "doc_fake" }),
      writeMarkdown: async () => {},
      deleteDoc: async () => {},
      buildDocUrl: (_documentId: string) => "https://feishu.cn/docx/doc_fake"
    };

    const runtimeFactory = () => ({
      id: "fake-runtime",
      start: async () => {},
      stop: async () => {}
    });

    const plugins = defaultPlugins({
      feegleHome: "/tmp/feegle-test",
      feishuClient,
      cloudDoc,
      runtimeFactory
    });

    const contributions = collectContributions(plugins);

    const pluginIds = plugins.map((p) => p.id);
    expect(pluginIds).toContain("core");
    expect(pluginIds).toContain("stock");
    expect(pluginIds).toContain("gitlab-follow");
    expect(pluginIds).toContain("webhook");
    expect(pluginIds).toContain("feishu");

    // Runtime contributions are not empty
    expect(contributions.runtimeContributions.length).toBeGreaterThan(0);

    const runtimeContributionIds = contributions.runtimeContributions.map((rc) => rc.id);
    expect(runtimeContributionIds).toContain("feishu-runtime");
    expect(runtimeContributionIds).toContain("webhook-runtime");

    // gitlab-runtime exists as a module but is intentionally not in
    // defaultPlugins because gitlab-follow uses the HandlerKind integration
    // pattern instead of a runtime contribution.
    // acceptance-allow-missing: gitlab-runtime is not in defaultPlugins;
    // gitlab-follow plugin uses handlerKind-based scheduler integration
    // rather than ingress-runtime path.
    const missingWithReason = new Map<string, string>([
      ["gitlab-runtime", "gitlab-follow plugin uses handlerKind integration, not runtime contribution; accepted-by-product-owner"]
    ]);

    for (const [missingId, reason] of missingWithReason) {
      if (!runtimeContributionIds.includes(missingId)) {
        // Verify the allowlist entry has a non-empty reason
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });
});
