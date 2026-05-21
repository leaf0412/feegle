import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorySetupService } from "../../src/workbench/directory-setup-service.js";

describe("DirectorySetupService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-directory-setup-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("saves a readable manual path and resumes the pending chat request", async () => {
    const shortcutPath = join(home, "shortcut");
    const manualPath = join(home, "manual");
    await mkdir(shortcutPath);
    await mkdir(manualPath);
    const upsert = vi.fn();
    const take = vi.fn(() => ({
      interactionId: "pi_1",
      chatId: "oc_1",
      messageId: "om_original",
      kind: "directory_setup",
      payload: { sessionKey: "feishu:oc_1:channel", userText: "inspect repo" },
      createdAt: "2026-05-21T00:00:00.000Z",
      expiresAt: "2026-05-22T00:00:00.000Z"
    }));
    const handle = vi.fn(async () => ({ status: "delivered" as const }));
    const service = new DirectorySetupService({
      chatWorkspaces: { upsert },
      pendingInteractions: { take },
      chatHandler: { handle }
    });

    const reply = await service.handleDirectorySubmit({
      chatId: "oc_1",
      messageId: "om_card",
      sender: { platform: "feishu", userId: "ou_alice" },
      command: {
        type: "workbench_directory_submit",
        interactionId: "pi_1",
        provider: "codex",
        workspacePath: shortcutPath,
        manualPath
      }
    });

    expect(upsert).toHaveBeenCalledWith({
      chatId: "oc_1",
      workspacePath: manualPath,
      defaultProvider: "codex",
      updatedBy: "ou_alice"
    });
    expect(take).toHaveBeenCalledWith("pi_1");
    expect(handle).toHaveBeenCalledWith({
      chatId: "oc_1",
      triggerMessageId: "om_original",
      sessionKey: "feishu:oc_1:channel",
      userText: "inspect repo"
    });
    expect(reply).toMatchObject({ kind: "feishu_card_update" });
    expect(JSON.stringify(reply)).toContain("已保存工作目录");
    expect(JSON.stringify(reply)).not.toContain("form_submit");
  });

  it("rejects unreadable workspace paths without consuming the pending request", async () => {
    const upsert = vi.fn();
    const take = vi.fn();
    const handle = vi.fn();
    const service = new DirectorySetupService({
      chatWorkspaces: { upsert },
      pendingInteractions: { take },
      chatHandler: { handle }
    });

    const reply = await service.handleDirectorySubmit({
      chatId: "oc_1",
      messageId: "om_card",
      command: {
        type: "workbench_directory_submit",
        interactionId: "pi_1",
        manualPath: join(home, "missing")
      }
    });

    expect(reply?.kind).toBe("text");
    expect(reply && "text" in reply ? reply.text : "").toContain("工作目录不可读取或不是目录");
    expect(upsert).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects stale directory setup submissions without changing the group binding", async () => {
    const workspacePath = join(home, "workspace");
    await mkdir(workspacePath);
    const upsert = vi.fn();
    const take = vi.fn(() => undefined);
    const handle = vi.fn();
    const service = new DirectorySetupService({
      chatWorkspaces: { upsert },
      pendingInteractions: { take },
      chatHandler: { handle }
    });

    const reply = await service.handleDirectorySubmit({
      chatId: "oc_1",
      messageId: "om_card",
      command: {
        type: "workbench_directory_submit",
        interactionId: "pi_consumed",
        provider: "codex",
        workspacePath
      }
    });

    expect(reply).toEqual({ kind: "text", text: "目录选择已过期或已处理。请重新发送需求。" });
    expect(take).toHaveBeenCalledWith("pi_consumed");
    expect(upsert).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });
});
