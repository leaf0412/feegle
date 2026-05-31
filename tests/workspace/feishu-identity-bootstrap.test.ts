import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdentityResolver } from "@core/ingress/identity-resolver.js";
import { PermissionPolicy } from "@core/ingress/permission-policy.js";
import { WorkspaceResolver } from "@core/ingress/workspace-resolver.js";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { bootstrapFeishuIdentity } from "@resources/workspace/feishu-identity-bootstrap.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";

describe("bootstrapFeishuIdentity", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: WorkspaceStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-feishu-bootstrap-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    store = new WorkspaceStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("binds a real Feishu sender and chat to a workspace for ingress", () => {
    const result = bootstrapFeishuIdentity(store, {
      workspaceId: "default",
      workspaceName: "Default Workspace",
      userId: "user_yb",
      displayName: "Yangbo",
      feishuOpenId: "ou_test_user",
      feishuChatId: "oc_test_chat",
      now: "2026-05-31T00:00:00.000Z"
    });

    expect(result).toEqual({
      workspaceId: "default",
      userId: "user_yb",
      conversationKey: "feishu:oc_test_chat",
      externalIdentityId: "ext_feishu_ou_test_user"
    });
    expect(new IdentityResolver(store).resolve({
      provider: "feishu",
      externalUserId: "ou_test_user"
    })).toMatchObject({ status: "resolved", userId: "user_yb" });
    expect(new WorkspaceResolver(store).resolve({
      conversationKey: "feishu:oc_test_chat"
    })).toMatchObject({ status: "resolved", workspaceId: "default" });
    expect(new PermissionPolicy(store).checkPermission("default", "user_yb")).toMatchObject({
      allowed: true,
      role: "owner"
    });
  });

  it("is idempotent for repeated real bootstrap runs", () => {
    const input = {
      workspaceId: "default",
      workspaceName: "Default Workspace",
      userId: "user_yb",
      displayName: "Yangbo",
      feishuOpenId: "ou_test_user",
      feishuChatId: "oc_test_chat",
      now: "2026-05-31T00:00:00.000Z"
    };

    bootstrapFeishuIdentity(store, input);
    bootstrapFeishuIdentity(store, { ...input, displayName: "Yangbo Updated", now: "2026-05-31T00:01:00.000Z" });

    expect(store.getUser("user_yb")).toMatchObject({
      displayName: "Yangbo Updated",
      updatedAt: "2026-05-31T00:01:00.000Z"
    });
    expect(store.getMembership("default", "user_yb")).toMatchObject({ role: "owner" });
  });

  it("rejects empty identifiers instead of creating unusable rows", () => {
    expect(() => bootstrapFeishuIdentity(store, {
      workspaceId: " ",
      workspaceName: "Default Workspace",
      userId: "user_yb",
      displayName: "Yangbo",
      feishuOpenId: "ou_test_user",
      feishuChatId: "oc_test_chat",
      now: "2026-05-31T00:00:00.000Z"
    })).toThrow(/workspaceId is required/);
  });
});
