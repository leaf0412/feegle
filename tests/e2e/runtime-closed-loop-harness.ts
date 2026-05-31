import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";
import { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";
import { MemoryStore } from "@core/memory/memory-store.js";
import { MemoryService } from "@core/memory/memory-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";
import { ArtifactService } from "@core/artifacts/artifact-service.js";
import { ControlActionStore } from "@core/control/control-action-store.js";
import { ControlActionProcessor, type ControlActionHandlers } from "@core/control/control-action-processor.js";
import { RecoveryService } from "@core/recovery/recovery-service.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";

import { IngressDispatcher, type IngressEventSink, type IngressWorkflowRuntime } from "../../src/ingress/ingress-dispatcher.js";
import { IntentResolverRegistry } from "../../src/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "../../src/ingress/workflow-selector.js";
import type { IdentityResolverPort } from "../../src/ingress/identity-resolver.js";
import type { WorkspaceResolverPort } from "../../src/ingress/workspace-resolver.js";
import type { PermissionPolicyPort } from "../../src/ingress/permission-policy.js";

import { RuntimeInspectionService } from "../../src/operations/runtime-inspection-service.js";
import { RuntimeHealthService } from "../../src/operations/runtime-health-service.js";
import { StuckRunDetector } from "../../src/operations/stuck-run-detector.js";

export interface RecordedEffectCall {
  pluginId: string;
  effectType: string;
  input: unknown;
}

export interface RecordedControlAction {
  id: string;
  actionType: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface RecordedMemoryRecord {
  id: string;
  status: string;
  kind: string;
  scope: string;
  content: string;
}

export interface RuntimeClosedLoopHarness {
  // IDs
  workspaceId: string;
  userId: string;
  db: RuntimeDb;
  tmpDir: string;

  // ID counters (exposed so tests can compute IDs)
  wfiCounter: number;
  raCounter: number;

  // Runtime
  runtimeStore: RuntimeStore;
  workflowRegistry: WorkflowRegistry;
  effectHandlerRegistry: EffectHandlerRegistry;
  runtimeEffectExecutor: RuntimeEffectExecutor;
  workflowRuntime: WorkflowRuntime;

  // Ingress
  intentResolvers: IntentResolverRegistry;
  workflowSelector: WorkflowSelector;
  dispatcher: IngressDispatcher;

  // Control
  controlActionStore: ControlActionStore;
  controlActionProcessor: ControlActionProcessor;
  controlHandlers: ControlActionHandlers;

  // Memory
  memoryStore: MemoryStore;
  memoryService: MemoryService;

  // Artifacts
  artifactStore: ArtifactStore;
  artifactService: ArtifactService;

  // Recovery
  recoveryService: RecoveryService;

  // Operations
  inspectionService: RuntimeInspectionService;
  stuckDetector: StuckRunDetector;
  healthService: RuntimeHealthService;

  // Recording
  effectCalls: RecordedEffectCall[];
  emittedDiagnosticEvents: unknown[];

  // Helpers
  runtimeEvents(workflowInstanceId: string): string[];
  runtimeEventsPayloads(workflowInstanceId: string): unknown[];
  controlActions(): RecordedControlAction[];
  memoryRecords(): RecordedMemoryRecord[];
  artifactFiles(): string[];

  // ID generation
  nextWorkflowInstanceId(): string;
  nextRunAttemptId(): string;

  // Lifecycle
  close(): Promise<void>;
}

function stubIdentityResolver(): IdentityResolverPort {
  return {
    resolve(actorHint: Record<string, unknown> | undefined) {
      if (!actorHint) {
        return { status: "unknown" as const, reason: "no actor hint" };
      }
      const provider = actorHint.provider as string | undefined;
      const externalUserId = actorHint.externalUserId as string | undefined;
      if (provider === "feishu" && externalUserId === "ou_e2e") {
        return { status: "resolved" as const, userId: "user_e2e", displayName: "E2E User" };
      }
      // Default resolution for e2e
      return { status: "resolved" as const, userId: "user_e2e", displayName: "E2E User" };
    }
  };
}

function stubWorkspaceResolver(): WorkspaceResolverPort {
  return {
    resolve(conversationHint: Record<string, unknown> | undefined) {
      if (!conversationHint) {
        return { status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: "default" };
      }
      const key = conversationHint.conversationKey as string | undefined;
      if (key === "feishu:oc_e2e" || key === "gitlab:gitlab.example.com:42:issue:7" || key?.startsWith("gitlab:")) {
        return { status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: key };
      }
      // Default for test convos
      if (key) {
        return { status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: key };
      }
      return { status: "missing_binding", reason: `no binding: ${key}` };
    }
  };
}

function stubPermissionPolicy(): PermissionPolicyPort {
  return {
    checkPermission() {
      return { allowed: true, role: "owner" as const, reason: "e2e test user" };
    },
    decide(permission, _intentKind) {
      if (!permission.allowed) {
        return { kind: "deny" as const, reason: permission.reason };
      }
      return { kind: "allow" as const };
    }
  };
}

export async function createRuntimeClosedLoopHarness(): Promise<RuntimeClosedLoopHarness> {
  const tmpDir = await mkdtemp(join(tmpdir(), "feegle-e2e-"));
  const dbPath = join(tmpDir, "feegle.db");
  const artifactsDir = join(tmpDir, "artifacts");

  const db = openRuntimeDb(dbPath);

  // Seed workspace, user, membership, conversation binding
  const wsStore = new WorkspaceStore(db);
  const now = "2026-05-31T00:00:00.000Z";

  wsStore.createWorkspaceWithOwner({
    workspaceId: "ws_e2e",
    workspaceName: "E2E Workspace",
    userId: "user_e2e",
    displayName: "E2E User",
    now
  });

  wsStore.bindConversation({
    conversationKey: "feishu:oc_e2e",
    workspaceId: "ws_e2e",
    projectId: null,
    now
  });

  wsStore.linkExternalIdentity({
    provider: "feishu",
    externalUserId: "ou_e2e",
    userId: "user_e2e",
    now
  });

  // Bind gitlab conversation too
  wsStore.bindConversation({
    conversationKey: "gitlab:gitlab.example.com:42:issue:7",
    workspaceId: "ws_e2e",
    projectId: null,
    now
  });

  // ---- Create service instances ----

  const runtimeStore = new RuntimeStore(db);
  const workflowRegistry = new WorkflowRegistry();
  const effectHandlerRegistry = new EffectHandlerRegistry();

  const effectCalls: RecordedEffectCall[] = [];
  const emittedDiagnosticEvents: unknown[] = [];

  const runtimeEffectExecutor = new RuntimeEffectExecutor(runtimeStore, effectHandlerRegistry);

  const memoryStore = new MemoryStore(db);
  const memoryService = new MemoryService(memoryStore);

  const artifactStore = new ArtifactStore(db);
  const artifactService = new ArtifactService(artifactStore, artifactsDir);

  const controlActionStore = new ControlActionStore(db);

  const controlHandlers: ControlActionHandlers = {};

  const eventSink: IngressEventSink = {
    emit(input) {
      emittedDiagnosticEvents.push(input);
    }
  };

  const controlEventSink = {
    emit(input: {
      id: string;
      workspaceId: string;
      workflowInstanceId: string | null;
      runAttemptId: string | null;
      stepStateId: string | null;
      effectExecutionId: string | null;
      category: string;
      type: string;
      payload: unknown;
      now: string;
    }) {
      emittedDiagnosticEvents.push(input);
    }
  };

  const controlActionProcessor = new ControlActionProcessor(controlActionStore, controlHandlers, controlEventSink);

  const recoveryService = new RecoveryService(artifactService, runtimeStore, artifactStore, memoryStore);

  const workflowRuntime = new WorkflowRuntime(runtimeStore, workflowRegistry, runtimeEffectExecutor, memoryService);

  const inspectionService = new RuntimeInspectionService(runtimeStore);
  const stuckDetector = new StuckRunDetector(runtimeStore, 5000);
  const healthService = new RuntimeHealthService(runtimeStore, db, stuckDetector);

  // Intent and workflow selection
  const intentResolvers = new IntentResolverRegistry();
  const workflowSelectorInstance = new WorkflowSelector();

  // ID generation counters
  let wfiCounter = 0;
  let raCounter = 0;

  const ingressRuntime: IngressWorkflowRuntime = {
    start(input) {
      return workflowRuntime.start(input);
    }
  };

  const dispatcher = new IngressDispatcher({
    identityResolver: stubIdentityResolver(),
    workspaceResolver: stubWorkspaceResolver(),
    permissionPolicy: stubPermissionPolicy(),
    intentResolvers,
    workflowSelector: workflowSelectorInstance,
    workflowRuntime: ingressRuntime,
    eventSink,
    idFactory: {
      workflowInstanceId() {
        wfiCounter++;
        return `wfi_e2e_${wfiCounter}`;
      },
      runAttemptId() {
        raCounter++;
        return `ra_e2e_${raCounter}`;
      }
    },
    clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
  });

  const harness: RuntimeClosedLoopHarness = {
    workspaceId: "ws_e2e",
    userId: "user_e2e",
    db,
    tmpDir,

    get wfiCounter() { return wfiCounter; },
    get raCounter() { return raCounter; },

    runtimeStore,
    workflowRegistry,
    effectHandlerRegistry,
    runtimeEffectExecutor,
    workflowRuntime,

    intentResolvers,
    workflowSelector: workflowSelectorInstance,
    dispatcher,

    controlActionStore,
    controlActionProcessor,
    controlHandlers,

    memoryStore,
    memoryService,

    artifactStore,
    artifactService,

    recoveryService,

    inspectionService,
    stuckDetector,
    healthService,

    effectCalls,
    emittedDiagnosticEvents,

    runtimeEvents(workflowInstanceId: string): string[] {
      return runtimeStore.listRuntimeEvents(workflowInstanceId).map((e) => e.type);
    },

    runtimeEventsPayloads(workflowInstanceId: string): unknown[] {
      return runtimeStore.listRuntimeEvents(workflowInstanceId).map((e) => e.payload);
    },

    controlActions(): RecordedControlAction[] {
      const pending = controlActionStore.listPending("ws_e2e");
      const all: RecordedControlAction[] = [];
      // Also read completed/failed ones by scanning known IDs
      for (const p of pending) {
        all.push({
          id: p.id,
          actionType: p.actionType,
          status: p.status,
          payload: p.payload
        });
      }
      return all;
    },

    memoryRecords(): RecordedMemoryRecord[] {
      return memoryStore.listActive("ws_e2e").map((m) => ({
        id: m.id,
        status: "active",
        kind: m.kind,
        scope: m.scope,
        content: m.content
      }));
    },

    artifactFiles(): string[] {
      const runArtifacts = artifactStore.listByRun("ws_e2e", "");
      // Get all artifacts for ws_e2e from the DB
      // We need to check by workflow instance
      return runArtifacts.map((a) => a.filePath);
    },

    nextWorkflowInstanceId() {
      wfiCounter++;
      return `wfi_e2e_${wfiCounter}`;
    },

    nextRunAttemptId() {
      raCounter++;
      return `ra_e2e_${raCounter}`;
    },

    async close() {
      db.close();
      await rm(tmpDir, { recursive: true, force: true });
    }
  };

  return harness;
}
