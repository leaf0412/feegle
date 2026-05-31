import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { GitLabFollowStore } from "../../src/integrations/gitlab/gitlab-follow-store.js";

describe("GitLabFollowStore", () => {
  let home: string;
  let db: RuntimeDb;
  let store: GitLabFollowStore;

  const seed = {
    host: "gitlab.example.com",
    projectId: 7,
    issueIid: 42,
    issueUrl: "https://gitlab.example.com/group/proj/-/issues/42",
    projectPath: "group/proj",
    title: "Fix the thing"
  };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-gitlab-follow-"));
    db = openRuntimeDb(join(home, "feegle.db"));
    store = new GitLabFollowStore(db, () => new Date("2026-05-26T00:00:00.000Z"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("creates a discovered entry with timestamps", () => {
    const entry = store.ensureEntry(seed);

    expect(entry.status).toBe("discovered");
    expect(entry.issueIid).toBe(42);
    expect(entry.projectPath).toBe("group/proj");
    expect(entry.createdAt).toBe("2026-05-26T00:00:00.000Z");
    // nullable columns must round-trip as null, not undefined — store consumers branch on null
    expect(entry.agentResponse).toBeNull();
    expect(entry.branchName).toBeNull();
  });

  it("is idempotent: re-ingesting the same issue does not reset its status", () => {
    const first = store.ensureEntry(seed);
    store.setStatus(first, "executing");

    // a later poll re-discovers the same issue
    const second = store.ensureEntry(seed);

    // insert-or-ignore must preserve the advanced status, not knock it back to discovered
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("executing");
  });

  it("maps camelCase extra fields onto snake_case columns", () => {
    const entry = store.ensureEntry(seed);

    store.setStatus(entry, "branch_proposed", {
      agentResponse: "plan text",
      branchName: "yb/feat/fix_thing",
      userFeedback: "looks good"
    });

    const reloaded = store.get(seed.host, seed.projectId, seed.issueIid)!;
    expect(reloaded.status).toBe("branch_proposed");
    expect(reloaded.agentResponse).toBe("plan text");
    expect(reloaded.branchName).toBe("yb/feat/fix_thing");
    expect(reloaded.userFeedback).toBe("looks good");
  });

  it("listActive excludes done and rejected, keeps everything else", () => {
    const active = store.ensureEntry(seed);
    store.setStatus(active, "executing");

    const doneEntry = store.ensureEntry({ ...seed, issueIid: 43, issueUrl: seed.issueUrl.replace("42", "43") });
    store.setStatus(doneEntry, "done");

    const rejectedEntry = store.ensureEntry({ ...seed, issueIid: 44, issueUrl: seed.issueUrl.replace("42", "44") });
    store.setStatus(rejectedEntry, "rejected");

    const listed = store.listActive();
    expect(listed.map((e) => e.issueIid)).toEqual([42]);
  });

  it("returns undefined for an unknown entry", () => {
    expect(store.get("nope.com", 1, 1)).toBeUndefined();
  });
});
