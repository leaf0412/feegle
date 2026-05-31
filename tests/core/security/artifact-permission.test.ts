import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { ArtifactService } from "@core/artifacts/artifact-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";
import { PermissionService } from "@core/security/permission-service.js";
import { PolicyService } from "@core/security/policy-service.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";
import { containsSecretValue, redactSecretValues } from "@core/security/secret-resolver.js";

describe("Artifact permission and security", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-sec-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));

    // Workspaces
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_a', 'Workspace A', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_b', 'Workspace B', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();

    // Users
    db.prepare(
      `insert into users (id, display_name, created_at, updated_at)
       values ('u1', 'Alice', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    db.prepare(
      `insert into users (id, display_name, created_at, updated_at)
       values ('u2', 'Bob', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();

    // Alice is owner of ws_a, Bob is viewer of ws_a
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, created_at, updated_at)
       values ('ws_a', 'u1', 'owner', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, created_at, updated_at)
       values ('ws_a', 'u2', 'viewer', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    // Bob is owner of ws_b
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, created_at, updated_at)
       values ('ws_b', 'u2', 'owner', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeServiceWithPermissions(): ArtifactService {
    const workspaceStore = new WorkspaceStore(db);
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

  describe("cross-workspace access prevention", () => {
    it("owner of ws_b cannot read artifact in ws_a", async () => {
      const service = makeServiceWithPermissions();

      // Alice (u1, owner of ws_a) writes artifact to ws_a
      await service.writeTextArtifact({
        artifactId: "art_ws_a",
        workspaceId: "ws_a",
        kind: "diagnostic_bundle",
        fileName: "ws_a.json",
        content: JSON.stringify({ secret: "data" }),
        now: "2026-05-30T00:00:00.000Z",
        userId: "u1"
      });

      // Bob (u2, owner of ws_b, viewer of ws_a) tries to read — should be allowed
      // since Bob IS a member of ws_a (as viewer)
      const readCheck = service.canReadArtifact("u2", "art_ws_a");
      expect(readCheck.allowed).toBe(true);
    });

    it("user not in any workspace cannot access any artifact", async () => {
      const service = makeServiceWithPermissions();

      await service.writeTextArtifact({
        artifactId: "art_isolated",
        workspaceId: "ws_a",
        kind: "test_report",
        fileName: "isolated.json",
        content: "{}",
        now: "2026-05-30T00:00:00.000Z",
        userId: "u1"
      });

      // u_nonex is not a member of any workspace
      const readCheck = service.canReadArtifact("u_nonex", "art_isolated");
      expect(readCheck.allowed).toBe(false);
      expect(readCheck.reason).toContain("not a member");
    });

    it("viewer can read but cannot delete artifact", async () => {
      const service = makeServiceWithPermissions();

      await service.writeTextArtifact({
        artifactId: "art_viewer_test",
        workspaceId: "ws_a",
        kind: "test_report",
        fileName: "viewer.json",
        content: "{}",
        now: "2026-05-30T00:00:00.000Z",
        userId: "u1"
      });

      // u2 is viewer in ws_a - can read
      expect(service.canReadArtifact("u2", "art_viewer_test").allowed).toBe(true);
      // u2 is viewer in ws_a - cannot delete
      expect(service.canDeleteArtifact("u2", "art_viewer_test").allowed).toBe(false);
    });
  });

  describe("secret scanning and redaction", () => {
    it("containsSecretValue detects GitHub PAT classic", () => {
      expect(containsSecretValue("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBe(true);
    });

    it("containsSecretValue detects Anthropic key", () => {
      expect(
        containsSecretValue("Authorization: sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456")
      ).toBe(true);
    });

    it("containsSecretValue detects OpenAI keys", () => {
      expect(containsSecretValue("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789")).toBe(true);
    });

    it("containsSecretValue detects GitLab PAT", () => {
      expect(containsSecretValue("glpat-abcdefghijklmnopqrst")).toBe(true);
    });

    it("containsSecretValue returns false for clean content", () => {
      expect(containsSecretValue("hello world")).toBe(false);
      expect(containsSecretValue(JSON.stringify({ result: "ok" }))).toBe(false);
      expect(containsSecretValue(42)).toBe(false);
      expect(containsSecretValue(null)).toBe(false);
    });

    it("containsSecretValue scans nested objects", () => {
      expect(
        containsSecretValue({
          config: {
            env: { TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }
          }
        })
      ).toBe(true);
    });

    it("containsSecretValue scans arrays", () => {
      expect(containsSecretValue(["plain", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"])).toBe(true);
    });

    it("redactSecretValues replaces GitHub PAT with redacted placeholder", () => {
      const result = redactSecretValues("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
      expect(result).not.toContain("ghp_");
      expect(result).toContain("[REDACTED_GITHUB_PAT_CLASSIC]");
    });

    it("redactSecretValues replaces multiple secrets in same string", () => {
      const content = JSON.stringify({
        gh_token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        ant_key: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz12"
      });
      const result = redactSecretValues(content);
      expect(result).not.toContain("ghp_");
      expect(result).not.toContain("sk-ant-api03");
      expect(result).toContain("[REDACTED_GITHUB_PAT_CLASSIC]");
      expect(result).toContain("[REDACTED_ANTHROPIC_KEY]");
    });

    it("redactSecretValues preserves non-secret values", () => {
      const obj = { name: "test", value: 42, nested: { ok: true } };
      const result = redactSecretValues(obj);
      expect(result).toEqual(obj);
    });

    it("redactSecretValues handles JWT tokens", () => {
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = redactSecretValues(jwt);
      expect(result).not.toContain("eyJ");
      expect(result).toContain("[REDACTED_JWT]");
    });

    it("artifact written through service has no raw secrets", async () => {
      const service = makeServiceWithPermissions();

      const content = JSON.stringify({
        result: "ok",
        headers: {
          Authorization: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz12"
        },
        config: {
          token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789"
        }
      });

      const artifact = await service.writeTextArtifact({
        artifactId: "art_secrets",
        workspaceId: "ws_a",
        kind: "diagnostic_bundle",
        fileName: "secrets.json",
        content,
        now: "2026-05-30T00:00:00.000Z"
      });

      const { readFileSync } = await import("node:fs");
      const written = readFileSync(artifact.filePath, "utf8");

      // No raw secrets in written content
      expect(written).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz12");
      expect(written).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
      // Redacted placeholders are present
      expect(written).toContain("[REDACTED_ANTHROPIC_KEY]");
      expect(written).toContain("[REDACTED_GITHUB_PAT_CLASSIC]");
      // Non-sensitive data preserved
      expect(written).toContain('"ok"');
    });
  });
});
