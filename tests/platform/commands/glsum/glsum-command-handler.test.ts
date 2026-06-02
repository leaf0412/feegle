import { describe, expect, it, vi } from "vitest";
import { GlsumCommandHandler } from "@platform/commands/glsum/glsum-command-handler.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";
import type { GitLabClient } from "@integrations/gitlab/gitlab-client.js";
import type { Agent } from "@integrations/agent/agent-session.js";
import { fakeAgentFromEvents } from "@tests/fixtures/fake-agent.js";
import type { PipelineHooks } from "@platform/pipeline-hooks.js";

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

// Records each prompt the agent received, so tests can assert it was invoked.
function stubAgent(response: string): Agent & { sent: string[] } {
  const sent: string[] = [];
  const agent = fakeAgentFromEvents((prompt) => {
    sent.push(prompt);
    return [{ kind: "text", text: response }, { kind: "result" }];
  });
  return Object.assign(agent, { sent });
}

function throwingAgent(message: string): Agent {
  return fakeAgentFromEvents(() => {
    throw new Error(message);
  });
}

function recordingHooks(): PipelineHooks & { prompts: string[]; responses: string[] } {
  const prompts: string[] = [];
  const responses: string[] = [];
  return {
    prompts,
    responses,
    onAgentPrompt(_id, prompt) { prompts.push(prompt); },
    onAgentResponse(_id, response) { responses.push(response); }
  };
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
    expect(agent.sent).not.toHaveLength(0);
    expect((reply as { kind: "text"; text: string }).text).toContain("AI 总结内容");
  });

  it("fires onAgentPrompt and onAgentResponse hooks", async () => {
    const client = stubGitLabClient();
    const agent = stubAgent("AI summary response");
    const hooks = recordingHooks();
    const handler = new GlsumCommandHandler(client, agent, hooks);

    await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(hooks.prompts.length).toBeGreaterThanOrEqual(1);
    expect(hooks.prompts[0]).toContain("Test");
    expect(hooks.responses.length).toBeGreaterThanOrEqual(1);
    expect(hooks.responses[0]).toBe("AI summary response");
  });

  it("scans comments for QA URLs and includes them in agent prompt", async () => {
    const client = stubGitLabClient({
      getNotes: vi.fn().mockResolvedValue([
        { id: 1, body: "飞书缺陷地址: https://project.feishu.cn/test/issue/detail/123", created_at: "2026-05-21T00:00:00Z", system: false, author: { id: 1, username: "test", name: "测试" } }
      ])
    });
    const agent = stubAgent("summary");
    const hooks = recordingHooks();
    const handler = new GlsumCommandHandler(client, agent, hooks);

    await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    const allPrompts = hooks.prompts.join("|");
    expect(allPrompts).toContain("https://project.feishu.cn/test/issue/detail/123");
  });

  it("handles agent chat failure and fires onAgentError hook", async () => {
    const client = stubGitLabClient();
    const agent = throwingAgent("agent timeout");
    const errors: unknown[] = [];
    const hooks: PipelineHooks = { onAgentError(_id, err) { errors.push(err); } };
    const handler = new GlsumCommandHandler(client, agent, hooks);

    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));

    expect(reply.kind).toBe("text");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("handles postNote rejection gracefully", async () => {
    const client = stubGitLabClient({
      postNote: vi.fn().mockRejectedValue(new Error("post failed"))
    });
    const handler = new GlsumCommandHandler(client, undefined);
    const reply = await handler.execute(makeContext("https://www.lejuhub.com/pc/kuavo-tools/-/issues/14"));
    expect(reply.kind).toBe("text");
    expect((reply as { kind: "text"; text: string }).text).toContain("Test");
  });
});
