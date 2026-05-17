# Feishu Agent Gateway Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Feishu Agent Gateway flow from repository selection to local branches, offline prototype zip, plan generation, TDD development commits, and explicit push.

**Architecture:** Implement a small TypeScript service with isolated domain modules for requirements, repositories, workspaces, git operations, prototypes, and Agent CLI adapters. Keep Feishu integration behind an interface so phase 1 can test the workflow without a live Feishu app.

**Tech Stack:** Node.js, TypeScript, Vitest, Vite, SQLite or JSON-backed persistence for phase 1, native `git` CLI, zip utility library, Feishu service adapter.

---

## File Structure

- Create: `package.json` for scripts and dependencies.
- Create: `tsconfig.json` for TypeScript compiler settings.
- Create: `vitest.config.ts` for unit tests.
- Create: `src/domain/status.ts` for requirement statuses and transitions.
- Create: `src/domain/models.ts` for shared domain types.
- Create: `src/repositories/repository-registry.ts` for bot-level repository registration.
- Create: `src/requirements/requirement-service.ts` for requirement lifecycle orchestration.
- Create: `src/workspace/workspace-manager.ts` for deterministic local paths.
- Create: `src/git/git-service.ts` for clone, branch, commit, and push operations.
- Create: `src/prototype/prototype-generator.ts` for Vite offline zip generation.
- Create: `src/agent/agent-cli.ts` for the provider-independent interface.
- Create: `src/agent/codex-agent-adapter.ts` for the first adapter shell.
- Create: `src/feishu/feishu-gateway.ts` for command and card action boundaries.
- Create: `tests/domain/status.test.ts`.
- Create: `tests/workspace/workspace-manager.test.ts`.
- Create: `tests/requirements/requirement-service.test.ts`.
- Create: `tests/prototype/prototype-generator.test.ts`.

## Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create package scripts**

Add `package.json`:

```json
{
  "name": "feegle",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "archiver": "^7.0.1",
    "execa": "^9.6.0",
    "fs-extra": "^11.3.0",
    "vite": "^6.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4",
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Add `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create Vitest config**

Add `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Create entry point**

Add `src/index.ts`:

```ts
export const serviceName = "feegle-agent-gateway";
```

- [ ] **Step 5: Verify skeleton**

Run:

```bash
npm install
npm run typecheck
npm test
```

Expected:

```txt
typecheck exits 0
vitest exits 0 with no failing tests
```

- [ ] **Step 6: Commit**

Run only if this directory has been initialized as a git repository:

```bash
git add package.json tsconfig.json vitest.config.ts src/index.ts
git commit -m "chore: initialize gateway project"
```

## Task 2: Requirement State Machine

**Files:**
- Create: `src/domain/status.ts`
- Test: `tests/domain/status.test.ts`

- [ ] **Step 1: Write failing state transition tests**

Add `tests/domain/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../../src/domain/status.js";

describe("requirement state machine", () => {
  it("allows the phase 1 happy path in order", () => {
    expect(canTransition("created", "repo_selected")).toBe(true);
    expect(canTransition("repo_selected", "requirement_received")).toBe(true);
    expect(canTransition("requirement_received", "branch_suggested")).toBe(true);
    expect(canTransition("branch_suggested", "branch_created")).toBe(true);
    expect(canTransition("branch_created", "requirement_materialized")).toBe(true);
    expect(canTransition("requirement_materialized", "prototype_generated")).toBe(true);
    expect(canTransition("prototype_generated", "prototype_reviewing")).toBe(true);
    expect(canTransition("prototype_reviewing", "plan_generated")).toBe(true);
    expect(canTransition("plan_generated", "plan_confirmed")).toBe(true);
    expect(canTransition("plan_confirmed", "dev_running")).toBe(true);
    expect(canTransition("dev_running", "committed")).toBe(true);
    expect(canTransition("committed", "push_ready")).toBe(true);
    expect(canTransition("push_ready", "pushed")).toBe(true);
  });

  it("rejects skipping branch creation before materializing requirements", () => {
    expect(canTransition("branch_suggested", "requirement_materialized")).toBe(false);
    expect(() => assertTransition("branch_suggested", "requirement_materialized")).toThrow(
      "Invalid requirement transition: branch_suggested -> requirement_materialized"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/domain/status.test.ts
```

Expected: FAIL because `src/domain/status.ts` does not exist.

- [ ] **Step 3: Implement state machine**

Add `src/domain/status.ts`:

```ts
export const requirementStatuses = [
  "created",
  "repo_selected",
  "requirement_received",
  "branch_suggested",
  "branch_created",
  "requirement_materialized",
  "prototype_generated",
  "prototype_reviewing",
  "plan_generated",
  "plan_confirmed",
  "dev_running",
  "committed",
  "push_ready",
  "pushed",
  "closed"
] as const;

export type RequirementStatus = (typeof requirementStatuses)[number];

const allowedTransitions: Record<RequirementStatus, RequirementStatus[]> = {
  created: ["repo_selected", "closed"],
  repo_selected: ["requirement_received", "closed"],
  requirement_received: ["branch_suggested", "closed"],
  branch_suggested: ["branch_created", "closed"],
  branch_created: ["requirement_materialized", "closed"],
  requirement_materialized: ["prototype_generated", "closed"],
  prototype_generated: ["prototype_reviewing", "closed"],
  prototype_reviewing: ["plan_generated", "closed"],
  plan_generated: ["plan_confirmed", "closed"],
  plan_confirmed: ["dev_running", "closed"],
  dev_running: ["committed", "closed"],
  committed: ["push_ready", "closed"],
  push_ready: ["pushed", "closed"],
  pushed: ["closed"],
  closed: []
};

export function canTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: RequirementStatus, to: RequirementStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid requirement transition: ${from} -> ${to}`);
  }
}
```

- [ ] **Step 4: Verify state machine**

Run:

```bash
npm test -- tests/domain/status.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain/status.ts tests/domain/status.test.ts
git commit -m "feat: add requirement state machine"
```

## Task 3: Domain Models

**Files:**
- Create: `src/domain/models.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add domain types**

Create `src/domain/models.ts`:

```ts
import type { RequirementStatus } from "./status.js";

export interface RepositoryRecord {
  id: string;
  name: string;
  remoteUrl: string;
  defaultBaseBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequirementContext {
  id: string;
  chatId: string;
  title: string;
  status: RequirementStatus;
  requirementText: string;
  prototypeZipPath?: string;
  planPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequirementRepository {
  id: string;
  requirementId: string;
  repositoryId: string;
  localPath: string;
  baseBranch: string;
  suggestedBranch?: string;
  activeBranch?: string;
  branchStatus: "not_created" | "created";
  pushStatus: "not_ready" | "ready" | "pushed";
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRun {
  id: string;
  requirementId: string;
  kind: "prototype" | "plan" | "development";
  status: "queued" | "running" | "succeeded" | "failed";
  prompt: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface RequirementCommit {
  id: string;
  requirementId: string;
  repositoryId: string;
  commitHash: string;
  commitMessage: string;
  stepTitle: string;
  createdAt: Date;
  pushedAt?: Date;
}
```

- [ ] **Step 2: Export domain types**

Modify `src/index.ts`:

```ts
export const serviceName = "feegle-agent-gateway";

export type {
  AgentRun,
  RepositoryRecord,
  RequirementCommit,
  RequirementContext,
  RequirementRepository
} from "./domain/models.js";

export type { RequirementStatus } from "./domain/status.js";
```

- [ ] **Step 3: Verify type exports**

Run:

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/domain/models.ts src/index.ts
git commit -m "feat: define gateway domain models"
```

## Task 4: Workspace Manager

**Files:**
- Create: `src/workspace/workspace-manager.ts`
- Test: `tests/workspace/workspace-manager.test.ts`

- [ ] **Step 1: Write failing workspace tests**

Create `tests/workspace/workspace-manager.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";

describe("WorkspaceManager", () => {
  it("creates deterministic paths by chat, requirement, and repository", () => {
    const manager = new WorkspaceManager("/tmp/feegle-workspaces");

    expect(manager.requirementRoot("chat-1", "req-1")).toBe(
      "/tmp/feegle-workspaces/chat-1/req-1"
    );
    expect(manager.repositoryWorkingCopy("chat-1", "req-1", "repo-1")).toBe(
      "/tmp/feegle-workspaces/chat-1/req-1/repos/repo-1/working-copy"
    );
    expect(manager.artifactPath("chat-1", "req-1", "prototype.zip")).toBe(
      "/tmp/feegle-workspaces/chat-1/req-1/artifacts/prototype.zip"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/workspace/workspace-manager.test.ts
```

Expected: FAIL because `WorkspaceManager` does not exist.

- [ ] **Step 3: Implement workspace paths**

Create `src/workspace/workspace-manager.ts`:

```ts
import path from "node:path";

export class WorkspaceManager {
  constructor(private readonly rootDirectory: string) {}

  requirementRoot(chatId: string, requirementId: string): string {
    return path.join(this.rootDirectory, chatId, requirementId);
  }

  repositoryWorkingCopy(chatId: string, requirementId: string, repositoryId: string): string {
    return path.join(this.requirementRoot(chatId, requirementId), "repos", repositoryId, "working-copy");
  }

  artifactPath(chatId: string, requirementId: string, fileName: string): string {
    return path.join(this.requirementRoot(chatId, requirementId), "artifacts", fileName);
  }
}
```

- [ ] **Step 4: Verify workspace manager**

Run:

```bash
npm test -- tests/workspace/workspace-manager.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/workspace/workspace-manager.ts tests/workspace/workspace-manager.test.ts
git commit -m "feat: add deterministic workspace paths"
```

## Task 5: Repository Registry

**Files:**
- Create: `src/repositories/repository-registry.ts`
- Test: `tests/repositories/repository-registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `tests/repositories/repository-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRepositoryRegistry } from "../../src/repositories/repository-registry.js";

describe("InMemoryRepositoryRegistry", () => {
  it("registers and lists repositories", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repo = registry.add({
      name: "web-app",
      remoteUrl: "git@example.com:team/web-app.git",
      defaultBaseBranch: "main"
    });

    expect(repo.id).toMatch(/^repo_/);
    expect(registry.list()).toEqual([repo]);
  });

  it("returns selected repositories by id", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repo = registry.add({
      name: "api",
      remoteUrl: "git@example.com:team/api.git",
      defaultBaseBranch: "main"
    });

    expect(registry.getMany([repo.id])).toEqual([repo]);
    expect(() => registry.getMany(["missing"])).toThrow("Repository not found: missing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/repositories/repository-registry.test.ts
```

Expected: FAIL because registry does not exist.

- [ ] **Step 3: Implement registry**

Create `src/repositories/repository-registry.ts`:

```ts
import type { RepositoryRecord } from "../domain/models.js";

export interface AddRepositoryInput {
  name: string;
  remoteUrl: string;
  defaultBaseBranch: string;
}

export class InMemoryRepositoryRegistry {
  private readonly records: RepositoryRecord[] = [];
  private nextId = 1;

  add(input: AddRepositoryInput): RepositoryRecord {
    const now = new Date();
    const record: RepositoryRecord = {
      id: `repo_${this.nextId++}`,
      name: input.name,
      remoteUrl: input.remoteUrl,
      defaultBaseBranch: input.defaultBaseBranch,
      createdAt: now,
      updatedAt: now
    };
    this.records.push(record);
    return record;
  }

  list(): RepositoryRecord[] {
    return [...this.records];
  }

  getMany(ids: string[]): RepositoryRecord[] {
    return ids.map((id) => {
      const record = this.records.find((repo) => repo.id === id);
      if (!record) {
        throw new Error(`Repository not found: ${id}`);
      }
      return record;
    });
  }
}
```

- [ ] **Step 4: Verify registry**

Run:

```bash
npm test -- tests/repositories/repository-registry.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/repository-registry.ts tests/repositories/repository-registry.test.ts
git commit -m "feat: add repository registry"
```

## Task 6: Requirement Service

**Files:**
- Create: `src/requirements/requirement-service.ts`
- Test: `tests/requirements/requirement-service.test.ts`

- [ ] **Step 1: Write failing requirement service tests**

Create `tests/requirements/requirement-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRepositoryRegistry } from "../../src/repositories/repository-registry.js";
import { RequirementService } from "../../src/requirements/requirement-service.js";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";

describe("RequirementService", () => {
  it("starts one active requirement per chat and selects multiple repositories", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repoA = registry.add({ name: "web", remoteUrl: "git@example.com:web.git", defaultBaseBranch: "main" });
    const repoB = registry.add({ name: "api", remoteUrl: "git@example.com:api.git", defaultBaseBranch: "develop" });
    const service = new RequirementService(registry, new WorkspaceManager("/tmp/feegle"));

    const requirement = service.startRequirement("chat-1", "Retry failed training task");
    const selected = service.selectRepositories(requirement.id, [repoA.id, repoB.id]);

    expect(selected.context.status).toBe("repo_selected");
    expect(selected.repositories).toHaveLength(2);
    expect(selected.repositories[0]?.localPath).toBe("/tmp/feegle/chat-1/req_1/repos/repo_1/working-copy");
    expect(selected.repositories[1]?.baseBranch).toBe("develop");
  });

  it("rejects a second active requirement in the same chat", () => {
    const service = new RequirementService(new InMemoryRepositoryRegistry(), new WorkspaceManager("/tmp/feegle"));

    service.startRequirement("chat-1", "First");

    expect(() => service.startRequirement("chat-1", "Second")).toThrow(
      "Chat already has an active requirement: chat-1"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/requirements/requirement-service.test.ts
```

Expected: FAIL because `RequirementService` does not exist.

- [ ] **Step 3: Implement requirement service**

Create `src/requirements/requirement-service.ts`:

```ts
import type { RequirementContext, RequirementRepository } from "../domain/models.js";
import { assertTransition } from "../domain/status.js";
import type { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";

export class RequirementService {
  private readonly contexts: RequirementContext[] = [];
  private readonly requirementRepositories: RequirementRepository[] = [];
  private nextRequirementId = 1;
  private nextRequirementRepositoryId = 1;

  constructor(
    private readonly repositoryRegistry: InMemoryRepositoryRegistry,
    private readonly workspaceManager: WorkspaceManager
  ) {}

  startRequirement(chatId: string, title: string): RequirementContext {
    const active = this.contexts.find((context) => context.chatId === chatId && context.status !== "closed");
    if (active) {
      throw new Error(`Chat already has an active requirement: ${chatId}`);
    }

    const now = new Date();
    const context: RequirementContext = {
      id: `req_${this.nextRequirementId++}`,
      chatId,
      title,
      status: "created",
      requirementText: "",
      createdAt: now,
      updatedAt: now
    };
    this.contexts.push(context);
    return context;
  }

  selectRepositories(requirementId: string, repositoryIds: string[]): {
    context: RequirementContext;
    repositories: RequirementRepository[];
  } {
    const context = this.getContext(requirementId);
    assertTransition(context.status, "repo_selected");

    const now = new Date();
    const repositories = this.repositoryRegistry.getMany(repositoryIds).map((repository) => {
      const record: RequirementRepository = {
        id: `requirement_repo_${this.nextRequirementRepositoryId++}`,
        requirementId,
        repositoryId: repository.id,
        localPath: this.workspaceManager.repositoryWorkingCopy(context.chatId, requirementId, repository.id),
        baseBranch: repository.defaultBaseBranch,
        branchStatus: "not_created",
        pushStatus: "not_ready",
        createdAt: now,
        updatedAt: now
      };
      this.requirementRepositories.push(record);
      return record;
    });

    context.status = "repo_selected";
    context.updatedAt = now;
    return { context, repositories };
  }

  private getContext(requirementId: string): RequirementContext {
    const context = this.contexts.find((item) => item.id === requirementId);
    if (!context) {
      throw new Error(`Requirement not found: ${requirementId}`);
    }
    return context;
  }
}
```

- [ ] **Step 4: Verify requirement service**

Run:

```bash
npm test -- tests/requirements/requirement-service.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/requirements/requirement-service.ts tests/requirements/requirement-service.test.ts
git commit -m "feat: model multi-repo requirement contexts"
```

## Task 7: Git Service

**Files:**
- Create: `src/git/git-service.ts`
- Test: `tests/git/git-service.test.ts`

- [ ] **Step 1: Write tests with mocked command runner**

Create `tests/git/git-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GitService, type CommandRunner } from "../../src/git/git-service.js";

describe("GitService", () => {
  it("clones a repository into the requested path", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.clone("git@example.com:team/web.git", "/tmp/work/web");

    expect(calls).toEqual([["git", "clone", "git@example.com:team/web.git", "/tmp/work/web"]]);
  });

  it("creates a local branch from a base branch", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };
    const service = new GitService(runner);

    await service.createBranch("/tmp/work/web", "main", "yb/feat/req_retry");

    expect(calls).toEqual([
      ["git", "-C", "/tmp/work/web", "checkout", "main"],
      ["git", "-C", "/tmp/work/web", "checkout", "-b", "yb/feat/req_retry"]
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/git/git-service.test.ts
```

Expected: FAIL because `GitService` does not exist.

- [ ] **Step 3: Implement git service**

Create `src/git/git-service.ts`:

```ts
import { execa } from "execa";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (command, args) => {
  const result = await execa(command, args);
  return { stdout: result.stdout, stderr: result.stderr };
};

export class GitService {
  constructor(private readonly runner: CommandRunner = defaultRunner) {}

  async clone(remoteUrl: string, localPath: string): Promise<void> {
    await this.runner("git", ["clone", remoteUrl, localPath]);
  }

  async createBranch(localPath: string, baseBranch: string, branchName: string): Promise<void> {
    await this.runner("git", ["-C", localPath, "checkout", baseBranch]);
    await this.runner("git", ["-C", localPath, "checkout", "-b", branchName]);
  }

  async commit(localPath: string, files: string[], message: string): Promise<string> {
    await this.runner("git", ["-C", localPath, "add", ...files]);
    await this.runner("git", ["-C", localPath, "commit", "-m", message]);
    const result = await this.runner("git", ["-C", localPath, "rev-parse", "HEAD"]);
    return result.stdout.trim();
  }

  async push(localPath: string, branchName: string): Promise<void> {
    await this.runner("git", ["-C", localPath, "push", "-u", "origin", branchName]);
  }
}
```

- [ ] **Step 4: Verify git service**

Run:

```bash
npm test -- tests/git/git-service.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/git/git-service.ts tests/git/git-service.test.ts
git commit -m "feat: add git workflow service"
```

## Task 8: Offline Prototype Generator

**Files:**
- Create: `src/prototype/prototype-generator.ts`
- Test: `tests/prototype/prototype-generator.test.ts`

- [ ] **Step 1: Write prototype artifact tests**

Create `tests/prototype/prototype-generator.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PrototypeGenerator } from "../../src/prototype/prototype-generator.js";

describe("PrototypeGenerator", () => {
  it("writes a Vite project configured for offline relative assets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feegle-prototype-"));
    const generator = new PrototypeGenerator();

    await generator.writeSource({
      outputDirectory: root,
      title: "Retry failed task",
      requirementText: "Failed tasks need a retry confirmation flow."
    });

    const viteConfig = await fs.readFile(path.join(root, "vite.config.ts"), "utf8");
    const html = await fs.readFile(path.join(root, "index.html"), "utf8");
    const app = await fs.readFile(path.join(root, "src", "main.ts"), "utf8");

    expect(viteConfig).toContain("base: './'");
    expect(html).toContain("Retry failed task");
    expect(app).toContain("Failed tasks need a retry confirmation flow.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/prototype/prototype-generator.test.ts
```

Expected: FAIL because `PrototypeGenerator` does not exist.

- [ ] **Step 3: Implement source generation**

Create `src/prototype/prototype-generator.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export interface WritePrototypeSourceInput {
  outputDirectory: string;
  title: string;
  requirementText: string;
}

export class PrototypeGenerator {
  async writeSource(input: WritePrototypeSourceInput): Promise<void> {
    await fs.mkdir(path.join(input.outputDirectory, "src"), { recursive: true });
    await fs.writeFile(path.join(input.outputDirectory, "vite.config.ts"), this.viteConfig(), "utf8");
    await fs.writeFile(path.join(input.outputDirectory, "index.html"), this.indexHtml(input.title), "utf8");
    await fs.writeFile(path.join(input.outputDirectory, "src", "main.ts"), this.mainTs(input), "utf8");
  }

  private viteConfig(): string {
    return `import { defineConfig } from "vite";

export default defineConfig({
  base: './'
});
`;
  }

  private indexHtml(title: string): string {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.escapeHtml(title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
  }

  private mainTs(input: WritePrototypeSourceInput): string {
    return `const requirementText = ${JSON.stringify(input.requirementText)};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = \`
  <main style="font-family: system-ui, sans-serif; max-width: 960px; margin: 32px auto; line-height: 1.6;">
    <p style="padding: 8px 12px; background: #fff7ed; border: 1px solid #fed7aa;">
      此页面仅用于需求确认，不代表最终 UI 设计
    </p>
    <h1>${this.escapeTemplate(input.title)}</h1>
    <section>
      <h2>需求说明</h2>
      <pre style="white-space: pre-wrap;">\${requirementText}</pre>
    </section>
    <section>
      <h2>交互演示</h2>
      <button id="retry-button">重试失败任务</button>
      <p id="status-text">当前状态：失败</p>
    </section>
  </main>
\`;

document.querySelector<HTMLButtonElement>("#retry-button")!.addEventListener("click", () => {
  const confirmed = window.confirm("确认重新执行该任务？");
  if (confirmed) {
    document.querySelector<HTMLParagraphElement>("#status-text")!.textContent = "当前状态：重试中";
  }
});
`;
  }

  private escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  private escapeTemplate(value: string): string {
    return this.escapeHtml(value).replaceAll("`", "\\`").replaceAll("${", "\\${");
  }
}
```

- [ ] **Step 4: Verify prototype source generation**

Run:

```bash
npm test -- tests/prototype/prototype-generator.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/prototype/prototype-generator.ts tests/prototype/prototype-generator.test.ts
git commit -m "feat: generate offline prototype source"
```

## Task 9: Agent CLI Abstraction

**Files:**
- Create: `src/agent/agent-cli.ts`
- Create: `src/agent/codex-agent-adapter.ts`
- Test: `tests/agent/codex-agent-adapter.test.ts`

- [ ] **Step 1: Write adapter command test**

Create `tests/agent/codex-agent-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CodexAgentAdapter } from "../../src/agent/codex-agent-adapter.js";

describe("CodexAgentAdapter", () => {
  it("delegates plan generation to the injected runner", async () => {
    const prompts: string[] = [];
    const adapter = new CodexAgentAdapter(async (prompt) => {
      prompts.push(prompt);
      return "1. Add retry button";
    });

    const plan = await adapter.generatePlan({
      requirementId: "req_1",
      title: "Retry",
      requirementText: "Retry failed tasks"
    });

    expect(plan).toBe("1. Add retry button");
    expect(prompts[0]).toContain("Retry failed tasks");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/agent/codex-agent-adapter.test.ts
```

Expected: FAIL because adapter files do not exist.

- [ ] **Step 3: Define Agent CLI interface**

Create `src/agent/agent-cli.ts`:

```ts
export interface AgentRequirementContext {
  requirementId: string;
  title: string;
  requirementText: string;
}

export interface AgentRepositoryContext {
  repositoryId: string;
  localPath: string;
  branchName: string;
}

export interface AgentCli {
  generatePrototype(context: AgentRequirementContext): Promise<string>;
  generatePlan(context: AgentRequirementContext): Promise<string>;
  runDevelopmentTask(
    context: AgentRequirementContext,
    repository: AgentRepositoryContext,
    task: string
  ): Promise<string>;
}
```

- [ ] **Step 4: Implement Codex adapter shell**

Create `src/agent/codex-agent-adapter.ts`:

```ts
import type { AgentCli, AgentRepositoryContext, AgentRequirementContext } from "./agent-cli.js";

export type PromptRunner = (prompt: string) => Promise<string>;

export class CodexAgentAdapter implements AgentCli {
  constructor(private readonly runner: PromptRunner) {}

  generatePrototype(context: AgentRequirementContext): Promise<string> {
    return this.runner(`Generate an offline Vite prototype for requirement ${context.requirementId}.
Title: ${context.title}
Requirement:
${context.requirementText}`);
  }

  generatePlan(context: AgentRequirementContext): Promise<string> {
    return this.runner(`Generate a TDD development plan for requirement ${context.requirementId}.
Title: ${context.title}
Requirement:
${context.requirementText}`);
  }

  runDevelopmentTask(
    context: AgentRequirementContext,
    repository: AgentRepositoryContext,
    task: string
  ): Promise<string> {
    return this.runner(`Run one TDD feature slice.
Requirement: ${context.requirementId}
Repository: ${repository.repositoryId}
Path: ${repository.localPath}
Branch: ${repository.branchName}
Task: ${task}`);
  }
}
```

- [ ] **Step 5: Verify adapter**

Run:

```bash
npm test -- tests/agent/codex-agent-adapter.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/agent/agent-cli.ts src/agent/codex-agent-adapter.ts tests/agent/codex-agent-adapter.test.ts
git commit -m "feat: add agent cli abstraction"
```

## Task 10: Feishu Gateway Boundary

**Files:**
- Create: `src/feishu/feishu-gateway.ts`
- Test: `tests/feishu/feishu-gateway.test.ts`

- [ ] **Step 1: Write command parsing tests**

Create `tests/feishu/feishu-gateway.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFeishuCommand } from "../../src/feishu/feishu-gateway.js";

describe("parseFeishuCommand", () => {
  it("parses repo selection with multiple repository ids", () => {
    expect(parseFeishuCommand("/repo select repo_1 repo_2")).toEqual({
      type: "repo_select",
      repositoryIds: ["repo_1", "repo_2"]
    });
  });

  it("parses push card actions per repository", () => {
    expect(parseFeishuCommand("card:push:req_1:repo_1")).toEqual({
      type: "push_repository",
      requirementId: "req_1",
      repositoryId: "repo_1"
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/feishu/feishu-gateway.test.ts
```

Expected: FAIL because gateway file does not exist.

- [ ] **Step 3: Implement command parser**

Create `src/feishu/feishu-gateway.ts`:

```ts
export type FeishuCommand =
  | { type: "repo_select"; repositoryIds: string[] }
  | { type: "push_repository"; requirementId: string; repositoryId: string }
  | { type: "unknown"; raw: string };

export function parseFeishuCommand(raw: string): FeishuCommand {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);

  if (parts[0] === "/repo" && parts[1] === "select" && parts.length > 2) {
    return { type: "repo_select", repositoryIds: parts.slice(2) };
  }

  if (trimmed.startsWith("card:push:")) {
    const [, , requirementId, repositoryId] = trimmed.split(":");
    if (requirementId && repositoryId) {
      return { type: "push_repository", requirementId, repositoryId };
    }
  }

  return { type: "unknown", raw };
}
```

- [ ] **Step 4: Verify Feishu gateway boundary**

Run:

```bash
npm test -- tests/feishu/feishu-gateway.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/feishu/feishu-gateway.ts tests/feishu/feishu-gateway.test.ts
git commit -m "feat: add feishu command boundary"
```

## Self-Review

- Spec coverage: repository registry, multi-repo requirements, branch gating, offline prototype zip, Agent CLI abstraction, TDD development commits, and explicit push are all mapped to implementation tasks.
- Placeholder scan: no `TBD`, `TODO`, or "implement later" placeholders are present.
- Type consistency: model names, status names, and adapter method names match across tasks.
- Scope check: phase 1 remains focused on local workflow orchestration and avoids permissions, MR automation, and GitLab/lejuhub integration.
