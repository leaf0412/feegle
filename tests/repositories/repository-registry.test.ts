import { describe, expect, it } from "vitest";
import { InMemoryRepositoryRegistry } from "@resources/repositories/repository-registry.js";

describe("InMemoryRepositoryRegistry", () => {
  it("registers and lists repositories", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repo = registry.add({
      name: "web-app",
      remoteUrl: "git@example.com:team/web-app.git",
      defaultBaseBranch: "main"
    });

    expect(repo).toMatchObject({
      name: "web-app",
      remoteUrl: "git@example.com:team/web-app.git",
      defaultBaseBranch: "main"
    });
    expect(repo.id).toMatch(/^repo_/);
    expect(repo.createdAt).toBeInstanceOf(Date);
    expect(repo.updatedAt).toEqual(repo.createdAt);
    expect(registry.list()).toEqual([repo]);
  });

  it("returns selected repositories by id in requested order", () => {
    const registry = new InMemoryRepositoryRegistry();
    const api = registry.add({
      name: "api",
      remoteUrl: "git@example.com:team/api.git",
      defaultBaseBranch: "main"
    });
    const web = registry.add({
      name: "web",
      remoteUrl: "git@example.com:team/web.git",
      defaultBaseBranch: "develop"
    });

    expect(registry.getMany([web.id, api.id])).toEqual([web, api]);
  });

  it("does not expose mutable internal repository records", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repo = registry.add({
      name: "web",
      remoteUrl: "git@example.com:team/web.git",
      defaultBaseBranch: "main"
    });

    repo.name = "changed";
    repo.createdAt.setFullYear(1999);
    const [listed] = registry.list();
    const [selected] = registry.getMany([repo.id]);

    expect(listed?.name).toBe("web");
    expect(listed?.createdAt.getFullYear()).not.toBe(1999);
    expect(selected?.name).toBe("web");
    expect(selected?.createdAt.getFullYear()).not.toBe(1999);
  });

  it("throws when a selected repository is missing", () => {
    const registry = new InMemoryRepositoryRegistry();

    expect(() => registry.getMany(["missing"])).toThrow("Repository not found: missing");
  });
});
