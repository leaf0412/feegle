import { describe, expect, it, vi } from "vitest";
import { GlsumCommandHandler } from "../../../../src/platform/commands/glsum/glsum-command-handler.js";
import type { SlashCommandContext } from "../../../../src/platform/slash-command-handler.js";
import type { GitLabClient } from "../../../../src/gitlab/gitlab-client.js";
import type { AgentCli } from "../../../../src/agent/agent-cli.js";

function makeContext(args: string): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_test",
    messageId: "om_test",
    sender: { platform: "feishu", userId: "u1" },
    definition: { id: "glsum", command: "/glsum <gitlab_url>", description: "", groupKey: "system", action: "" },
    raw: `/glsum ${args}`,
    args
  };
}

function stubGitLabClient(overrides: Partial<GitLabClient> = {}): GitLabClient {
  return {
    getIssue: vi.fn().mockResolvedValue({
      title: "Test", description: "desc", state: "opened",
      created_at: "2026-05-21T00:00:00Z", updated_at: "2026-05-21T00:00:00Z",
      assignee: { id: 1, username: "yebao", name: "叶宝" },
      due_date: null, labels: [], web_url: "https://example.com", iid: 1, id: 1
    }),
    getNotes: vi.fn().mockResolvedValue([]),
    postNote: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as GitLabClient;
}

function stubAgent(response: string): AgentCli {
  return {
    chat: vi.fn().mockResolvedValue(response),
    generatePrototype: vi.fn(),
    generatePlan: vi.fn(),
    runDevelopmentTask: vi.fn()
  } as unknown as AgentCli;
}

describe("GlsumCommandHandler", () => {
  it("replies with error when no URL is provided", async () => {
    const handler = new GlsumCommandHandler(stubGitLabClient(), undefined);

    const reply = await handler.execute(makeContext(""));

    expect(reply.kind).toBe("text");
    expect((reply as { kind: "text"; text: string }).text).toContain("请提供 GitLab issue 链接");
  });

  it("replies with error for invalid URL", async () => {
    const handler = new GlsumCommandHandler(stubGitLabClient(), undefined);

    const reply = await handler.execute(makeContext("not-a-url"));

    expect(reply.kind).toBe("text");
    expect((reply as { kind: "text"; text: string }).text).toContain("无法解析该 issue 链接");
  });

  it("returns basic summary (without agent) for valid URL", async () => {
    const client = stubGitLabClient();
    const handler = new GlsumCommandHandler(client, undefined);

    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(reply.kind).toBe("text");
    const text = (reply as { kind: "text"; text: string }).text;
    expect(text).toContain("Test");
    expect(text).toContain("yebao");
    expect(text).toContain("总结已写入");
    expect(client.getIssue).toHaveBeenCalled();
    expect(client.postNote).toHaveBeenCalled();
  });

  it("dispatches to agent when available", async () => {
    const client = stubGitLabClient();
    const agent = stubAgent("AI 总结内容");
    const handler = new GlsumCommandHandler(client, agent);

    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(agent.chat).toHaveBeenCalled();
    expect((reply as { kind: "text"; text: string }).text).toContain("AI 总结内容");
  });

  it("scans comments for QA URLs and includes them in agent prompt", async () => {
    const client = stubGitLabClient({
      getNotes: vi.fn().mockResolvedValue([
        { id: 1, body: "飞书缺陷地址: https://project.feishu.cn/test/issue/detail/123", created_at: "2026-05-21T00:00:00Z", system: false, author: { id: 1, username: "test", name: "测试" } }
      ])
    });
    const agent = stubAgent("summary");
    const handler = new GlsumCommandHandler(client, agent);

    await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    const chatCall = agent.chat as ReturnType<typeof vi.fn>;
    const promptArg = chatCall.mock.calls[0]?.[0]?.[0]?.content as string;
    expect(promptArg).toContain("https://project.feishu.cn/test/issue/detail/123");
  });

  it("handles agent chat failure gracefully in collectQaInfo", async () => {
    const client = stubGitLabClient({
      getNotes: vi.fn().mockResolvedValue([
        { id: 1, body: "飞书缺陷地址: https://project.feishu.cn/test/issue/detail/123", created_at: "2026-05-21T00:00:00Z", system: false, author: { id: 1, username: "test", name: "测试" } }
      ])
    });
    const agent = stubAgent("");
    (agent.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("agent timeout"));
    const handler = new GlsumCommandHandler(client, agent);

    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(reply.kind).toBe("text");
    const text1 = (reply as { kind: "text"; text: string }).text;
    expect(text1).toContain("(抓取失败)");
  });

  it("handles agent chat failure gracefully in generateAiSummary", async () => {
    const client = stubGitLabClient();
    const agent = stubAgent("");
    (agent.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("agent timeout"));
    const handler = new GlsumCommandHandler(client, agent);

    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(reply.kind).toBe("text");
    const text2 = (reply as { kind: "text"; text: string }).text;
    expect(text2).toContain("Test");
  });

  it("handles postNote rejection gracefully", async () => {
    const client = stubGitLabClient({
      postNote: vi.fn().mockRejectedValue(new Error("post failed"))
    });
    const handler = new GlsumCommandHandler(client, undefined);

    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(reply.kind).toBe("text");
    const text3 = (reply as { kind: "text"; text: string }).text;
    expect(text3).toContain("Test");
  });
});
