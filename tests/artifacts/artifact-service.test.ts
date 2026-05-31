import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { ArtifactService } from "@core/artifacts/artifact-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";
import { PermissionService } from "@core/security/permission-service.js";
import { PolicyService } from "@core/security/policy-service.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";

describe("ArtifactService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let workspaceStore: WorkspaceStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-artifacts-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_2', 'Team', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    // Create users and memberships
    db.prepare(
      `insert into users (id, display_name, created_at, updated_at)
       values ('user_a', 'Alice', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    db.prepare(
      `insert into users (id, display_name, created_at, updated_at)
       values ('user_b', 'Bob', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    db.prepare(
      `insert into users (id, display_name, created_at, updated_at)
       values ('admin_x', 'AdminX', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    // Alice is member of ws_1 (viewer)
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, created_at, updated_at)
       values ('ws_1', 'user_a', 'viewer', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    // Bob is admin of ws_1
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, created_at, updated_at)
       values ('ws_1', 'user_b', 'admin', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    // AdminX is owner of ws_2
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, created_at, updated_at)
       values ('ws_2', 'admin_x', 'owner', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    workspaceStore = new WorkspaceStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeService(): ArtifactService {
    return new ArtifactService(
      new ArtifactStore(db),
      join(tempDir, "artifacts")
    );
  }

  function makeServiceWithPermissions(): ArtifactService {
    const permissionService = new PermissionService(workspaceStore);
    const policyService = new PolicyService(
      (wsId: string, userId: string) =>
        workspaceStore.getMembership(wsId, userId) !== undefined
    );
    return new ArtifactService(
      new ArtifactStore(db),
      join(tempDir, "artifacts"),
      permissionService,
      policyService
    );
  }

  it("stores artifact metadata in SQLite and content on disk", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_1",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "art_1.json",
      content: JSON.stringify({ ok: true }),
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(readFileSync(artifact.filePath, "utf8")).toBe(JSON.stringify({ ok: true }));
    expect(artifact.retentionDays).toBe(90);
  });

  it("redacts bearer tokens from artifact content", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_bearer",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "art_bearer.json",
      content: JSON.stringify({
        headers: { Authorization: "bearer abc123token" },
        ok: true
      }),
      now: "2026-05-30T00:00:00.000Z"
    });

    const content = readFileSync(artifact.filePath, "utf8");
    expect(content).not.toContain("abc123token");
    expect(content).toContain("bearer [REDACTED]");
  });

  it("redacts GitHub PAT from artifact content", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_gh",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "art_gh.json",
      content: JSON.stringify({ token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }),
      now: "2026-05-30T00:00:00.000Z"
    });

    const content = readFileSync(artifact.filePath, "utf8");
    expect(content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(content).toContain("[REDACTED_GITHUB_PAT_CLASSIC]");
  });

  it("redacts Anthropic key from artifact content", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_ant",
      workspaceId: "ws_1",
      kind: "agent_transcript",
      fileName: "art_ant.json",
      content: JSON.stringify({ key: "sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" }),
      now: "2026-05-30T00:00:00.000Z"
    });

    const content = readFileSync(artifact.filePath, "utf8");
    expect(content).not.toContain("sk-ant-api03");
    expect(content).toContain("[REDACTED_ANTHROPIC_KEY]");
  });

  it("redacts private key content from artifacts", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_key",
      workspaceId: "ws_1",
      kind: "plugin_payload",
      fileName: "art_key.json",
      content: `some content before\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----\nafter`,
      now: "2026-05-30T00:00:00.000Z"
    });

    const content = readFileSync(artifact.filePath, "utf8");
    expect(content).not.toContain("MIIEvQIBADANBgkq");
    expect(content).toContain("[REDACTED_PRIVATE_KEY]");
  });

  it("permission check prevents cross-workspace artifact access", async () => {
    const service = makeServiceWithPermissions();

    // Write artifact to ws_1
    await service.writeTextArtifact({
      artifactId: "art_ws1",
      workspaceId: "ws_1",
      kind: "test_report",
      fileName: "report.json",
      content: JSON.stringify({ result: "pass" }),
      now: "2026-05-30T00:00:00.000Z"
    });

    // admin_x is owner of ws_2 but NOT a member of ws_1
    const readCheck = service.canReadArtifact("admin_x", "art_ws1");
    expect(readCheck.allowed).toBe(false);
    expect(readCheck.reason).toContain("not a member");
  });

  it("allows workspace member to read artifact in their workspace", async () => {
    const service = makeServiceWithPermissions();

    await service.writeTextArtifact({
      artifactId: "art_member",
      workspaceId: "ws_1",
      kind: "test_report",
      fileName: "report.json",
      content: JSON.stringify({ result: "pass" }),
      now: "2026-05-30T00:00:00.000Z"
    });

    // user_a is a viewer (member) of ws_1
    const readCheck = service.canReadArtifact("user_a", "art_member");
    expect(readCheck.allowed).toBe(true);
  });

  it("viewer cannot delete artifact (requires admin/owner)", async () => {
    const service = makeServiceWithPermissions();

    await service.writeTextArtifact({
      artifactId: "art_viewer",
      workspaceId: "ws_1",
      kind: "test_report",
      fileName: "report.json",
      content: JSON.stringify({}),
      now: "2026-05-30T00:00:00.000Z"
    });

    // user_a is a viewer of ws_1
    const deleteCheck = service.canDeleteArtifact("user_a", "art_viewer");
    expect(deleteCheck.allowed).toBe(false);
    expect(deleteCheck.reason).toContain("requires admin or owner");
  });

  it("admin can delete artifact in their workspace", async () => {
    const service = makeServiceWithPermissions();

    await service.writeTextArtifact({
      artifactId: "art_admin",
      workspaceId: "ws_1",
      kind: "test_report",
      fileName: "report.json",
      content: JSON.stringify({}),
      now: "2026-05-30T00:00:00.000Z"
    });

    // user_b is an admin of ws_1
    const deleteCheck = service.canDeleteArtifact("user_b", "art_admin");
    expect(deleteCheck.allowed).toBe(true);
  });

  it("returns false for non-existent artifact", async () => {
    const service = makeServiceWithPermissions();

    const readCheck = service.canReadArtifact("user_a", "non_existent");
    expect(readCheck.allowed).toBe(false);
    expect(readCheck.reason).toContain("not found");

    const deleteCheck = service.canDeleteArtifact("user_a", "non_existent");
    expect(deleteCheck.allowed).toBe(false);
    expect(deleteCheck.reason).toContain("not found");
  });

  it("system user bypasses all permission checks", async () => {
    const service = makeServiceWithPermissions();

    await service.writeTextArtifact({
      artifactId: "art_sys",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "sys.json",
      content: "{}",
      now: "2026-05-30T00:00:00.000Z"
    });

    const readCheck = service.canReadArtifact("system", "art_sys");
    expect(readCheck.allowed).toBe(true);

    const deleteCheck = service.canDeleteArtifact("system", "art_sys");
    expect(deleteCheck.allowed).toBe(true);
  });

  it("sets redacted flag in summary when secrets are redacted", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_redacted",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "redacted.json",
      content: JSON.stringify({ token: "ghp_abc123def456ghi789jkl012mno345pqr678stu" }),
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(artifact.summary.redacted).toBe(true);
  });

  it("does not set redacted flag when no secrets present", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_clean",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "clean.json",
      content: JSON.stringify({ result: "ok", value: 42 }),
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(artifact.summary.redacted).toBe(false);
  });

  it("static checkContentForSecrets detects secret patterns", () => {
    expect(ArtifactService.checkContentForSecrets("plain text")).toBeNull();
    expect(ArtifactService.checkContentForSecrets("key: ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBe(
      "detected known secret pattern in artifact content"
    );
  });

  it("plan_document artifacts have 365 day retention", async () => {
    const service = makeService();

    const artifact = await service.writeTextArtifact({
      artifactId: "art_plan",
      workspaceId: "ws_1",
      kind: "plan_document",
      fileName: "plan.md",
      content: "# Plan",
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(artifact.retentionDays).toBe(365);
  });

  it("prevents non-member from writing to workspace", async () => {
    const service = makeServiceWithPermissions();

    // admin_x is NOT a member of ws_1
    await expect(
      service.writeTextArtifact({
        artifactId: "art_blocked",
        workspaceId: "ws_1",
        kind: "diagnostic_bundle",
        fileName: "blocked.json",
        content: "{}",
        now: "2026-05-30T00:00:00.000Z",
        userId: "admin_x"
      })
    ).rejects.toThrow("PERMISSION_DENIED");
  });
});
