import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatWorkbenchState, WorkbenchButton } from "@features/workbench/workbench-models.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { PlatformCard } from "@platform/platform-card.js";
import type { WorkbenchStore } from "@features/workbench/workbench-store.js";
import { WorkbenchCardService, type WorkbenchAgent } from "@features/workbench/workbench-card-service.js";

function emptyState(overrides: Partial<ChatWorkbenchState> = {}): ChatWorkbenchState {
  return {
    chatId: "oc_test",
    repositories: ["https://example.com/repo"],
    requirementId: null,
    requirementText: null,
    requirementDocUrl: null,
    requirementVersion: 0,
    planText: null,
    planDocUrl: null,
    planVersion: 0,
    planStale: false,
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeMocks() {
  const requirementIdFactory = vi.fn().mockReturnValue("req_001");
  const storeMock = () => {
    let currentState: ChatWorkbenchState = emptyState();
    return {
      getOrCreate: vi.fn().mockImplementation(() => currentState),
      setRequirement: vi.fn().mockImplementation((_chatId, requirementId, text, docUrl) => {
        currentState = {
          ...currentState,
          requirementId,
          requirementText: text,
          requirementDocUrl: docUrl,
          requirementVersion: (currentState.requirementVersion ?? 0) + 1,
        };
      }),
      setPlan: vi.fn(),
      markPlanStale: vi.fn().mockImplementation(() => {
        currentState = { ...currentState, planStale: true };
      }),
      deletePlan: vi.fn(),
      deleteRequirement: vi.fn(),
      currentState,
    };
  };

  const storeObj = storeMock();
  const store: Pick<WorkbenchStore, "getOrCreate" | "setRequirement" | "setPlan" | "markPlanStale" | "deletePlan" | "deleteRequirement" | "addRepository" | "removeRepository"> = {
    ...storeObj,
    addRepository: vi.fn(),
    removeRepository: vi.fn(),
  };

  const cloudDoc: FeishuCloudDocClientPort = {
    createDoc: vi.fn().mockResolvedValue({ documentId: "doc_123" }),
    writeMarkdown: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    buildDocUrl: vi.fn().mockImplementation((id) => `https://feishu.cn/docx/${id}`),
  };

  const agent: WorkbenchAgent = {
    generatePlan: vi.fn().mockResolvedValue({ markdown: "generated plan" }),
    revisePlan: vi.fn().mockResolvedValue({ markdown: "revised plan" }),
  };

  return { store: { ...store, _inner: storeObj }, cloudDoc, agent, requirementIdFactory };
}

describe("WorkbenchCardService", () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: WorkbenchCardService;

  beforeEach(() => {
    mocks = makeMocks();
    service = new WorkbenchCardService(mocks);
  });

  describe("getCard", () => {
    it("loads state from store and returns rendered card", async () => {
      const state = emptyState({ requirementText: "hello" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      const card = await service.getCard("oc_test");

      expect(mocks.store.getOrCreate).toHaveBeenCalledWith("oc_test");
      expect(card.header?.title).toBe("工作台");
      expect(card).toBeDefined();
    });
  });

  describe("discuss_requirement", () => {
    it("creates cloud doc, stores requirement, marks plan stale", async () => {
      const state = emptyState({ planText: "old plan" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      const card = await service.handleAction("oc_test", "discuss_requirement", "需要实现用户登录功能");

      expect(mocks.requirementIdFactory).toHaveBeenCalled();
      expect(mocks.cloudDoc.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining("需求") }),
      );
      expect(mocks.cloudDoc.writeMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: "doc_123", markdown: "需要实现用户登录功能" }),
      );
      expect(mocks.store.setRequirement).toHaveBeenCalledWith(
        "oc_test",
        "req_001",
        "需要实现用户登录功能",
        "https://feishu.cn/docx/doc_123",
      );
      expect(mocks.store.markPlanStale).toHaveBeenCalledWith("oc_test");
      expect(card.header).toBeDefined();
    });

    it("throws when payload is missing", async () => {
      await expect(service.handleAction("oc_test", "discuss_requirement")).rejects.toThrow();
    });
  });

  describe("revise_requirement", () => {
    it("includes prior requirement text in new markdown", async () => {
      const state = emptyState({ requirementText: "original req text", requirementVersion: 1, planText: "old plan", requirementId: "req_existing" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      (mocks.store.setRequirement as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {});

      await service.handleAction("oc_test", "revise_requirement", "需要加上权限校验");

      expect(mocks.cloudDoc.createDoc).toHaveBeenCalled();
      expect(mocks.cloudDoc.writeMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({
          markdown: expect.stringContaining("original req text"),
        }),
      );
      const writeCall = (mocks.cloudDoc.writeMarkdown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.markdown).toContain("需要加上权限校验");
      expect(writeCall.markdown).toContain("用户反馈");
      expect(mocks.store.setRequirement).toHaveBeenCalledWith(
        "oc_test",
        "req_existing",
        expect.stringContaining("original req text"),
        expect.any(String),
      );
      expect(mocks.store.markPlanStale).toHaveBeenCalledWith("oc_test");
    });

    it("does not mark plan stale when no plan exists", async () => {
      const state = emptyState({ requirementText: "req", requirementId: "req_x", requirementVersion: 1, planText: null });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      await service.handleAction("oc_test", "revise_requirement", "feedback");

      expect(mocks.store.markPlanStale).not.toHaveBeenCalled();
    });

    it("throws when payload is missing", async () => {
      const state = emptyState({ requirementText: "req", requirementId: "req_x" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      await expect(service.handleAction("oc_test", "revise_requirement")).rejects.toThrow();
    });
  });

  describe("generate_plan", () => {
    it("uses persisted requirementId and reuses it across calls", async () => {
      const state = emptyState({
        requirementText: "做登录功能",
        requirementId: "req_persisted",
        requirementVersion: 1,
        repositories: ["https://example.com/repo"],
      });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      const card = await service.handleAction("oc_test", "generate_plan");

      expect(mocks.agent.generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementId: "req_persisted",
          requirementText: "做登录功能",
          repositories: ["https://example.com/repo"],
        }),
      );
      expect(mocks.requirementIdFactory).not.toHaveBeenCalled();
      expect(mocks.cloudDoc.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining("计划") }),
      );
      expect(mocks.cloudDoc.writeMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: "generated plan" }),
      );
      expect(mocks.store.setPlan).toHaveBeenCalledWith(
        "oc_test",
        "generated plan",
        "https://feishu.cn/docx/doc_123",
      );
      expect(card.header).toBeDefined();
    });

    it("throws when requirementText is null", async () => {
      const state = emptyState({ requirementText: null });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      await expect(service.handleAction("oc_test", "generate_plan")).rejects.toThrow();
    });

    it("throws when requirementId is null", async () => {
      const state = emptyState({ requirementId: null, requirementText: "req text" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      await expect(service.handleAction("oc_test", "generate_plan")).rejects.toThrow();
    });
  });

  describe("revise_plan", () => {
    it("uses persisted requirementId when revising plan", async () => {
      const state = emptyState({
        requirementText: "req",
        requirementId: "req_persisted",
        planText: "existing plan markdown",
        planVersion: 1,
      });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      await service.handleAction("oc_test", "revise_plan", "把步骤2改得更细");

      expect(mocks.agent.revisePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementId: "req_persisted",
          currentPlanMarkdown: "existing plan markdown",
          feedback: "把步骤2改得更细",
        }),
      );
      expect(mocks.requirementIdFactory).not.toHaveBeenCalled();
      expect(mocks.cloudDoc.createDoc).toHaveBeenCalled();
      expect(mocks.cloudDoc.writeMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: "revised plan" }),
      );
      expect(mocks.store.setPlan).toHaveBeenCalledWith(
        "oc_test",
        "revised plan",
        "https://feishu.cn/docx/doc_123",
      );
    });

    it("throws when requirementId is null", async () => {
      const state = emptyState({ requirementId: null, requirementText: "req", planText: "plan" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      await expect(service.handleAction("oc_test", "revise_plan", "feedback")).rejects.toThrow();
    });

    it("throws when payload is missing", async () => {
      const state = emptyState({ planText: "plan", requirementId: "req_x" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      await expect(service.handleAction("oc_test", "revise_plan")).rejects.toThrow();
    });

    it("throws when no current plan exists", async () => {
      const state = emptyState({ planText: null });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);
      await expect(service.handleAction("oc_test", "revise_plan", "feedback")).rejects.toThrow();
    });
  });

  describe("delete_plan", () => {
    it("calls store.deletePlan", async () => {
      const state = emptyState({ planText: "plan" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      await service.handleAction("oc_test", "delete_plan");

      expect(mocks.store.deletePlan).toHaveBeenCalledWith("oc_test");
      expect(mocks.agent.generatePlan).not.toHaveBeenCalled();
    });
  });

  describe("delete_requirement", () => {
    it("calls store.deleteRequirement (cascades to plan)", async () => {
      const state = emptyState({ requirementText: "req", requirementId: "req_x", planText: "plan" });
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      await service.handleAction("oc_test", "delete_requirement");

      expect(mocks.store.deleteRequirement).toHaveBeenCalledWith("oc_test");
      expect(mocks.store.deletePlan).not.toHaveBeenCalled();
    });
  });

  describe("manage_repos", () => {
    it("returns current card without side effects", async () => {
      const state = emptyState();
      (mocks.store.getOrCreate as ReturnType<typeof vi.fn>).mockReturnValue(state);

      const card = await service.handleAction("oc_test", "manage_repos");

      expect(card.header).toBeDefined();
      expect(mocks.store.setRequirement).not.toHaveBeenCalled();
      expect(mocks.store.setPlan).not.toHaveBeenCalled();
      expect(mocks.cloudDoc.createDoc).not.toHaveBeenCalled();
      expect(mocks.agent.generatePlan).not.toHaveBeenCalled();
    });
  });
});
