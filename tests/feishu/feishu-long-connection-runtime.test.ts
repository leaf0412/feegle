import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FeishuCardActionTriggerEvent,
  type FeishuMessageReceiveEvent
} from "../../src/feishu/feishu-event-adapter.js";
import {
  FeishuLongConnectionRuntime
} from "../../src/feishu/feishu-long-connection-runtime.js";

describe("FeishuLongConnectionRuntime", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers message and card handlers on the long connection dispatcher", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const starts: unknown[] = [];
    const handled: unknown[] = [];
    const consoleInfo = vi.mocked(console.info);

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(input: unknown): Promise<void> {
        starts.push(input);
      }
    }

    const runtime = new FeishuLongConnectionRuntime(
      {
        appId: "cli_xxx",
        appSecret: "secret_xxx",
        verificationToken: "token",
        encryptKey: "encrypt",
        botOpenId: "ou_bot"
      },
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      }
    );

    try {
      await runtime.start();
      await registered["im.message.receive_v1"]?.({
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 /repo select repo_1" }),
          mentions: [{ id: { open_id: "ou_bot" }, name: "bot", key: "@_user_1" }]
        }
      });
      await registered["card.action.trigger"]?.({
        action: {
          value: {
            action: "push_repository",
            requirementId: "req_1",
            repositoryId: "repo_1"
          }
        },
        context: { open_chat_id: "oc_1", open_message_id: "om_2" }
      });

      expect(starts).toHaveLength(1);
      expect(Object.keys(registered).sort()).toEqual(["card.action.trigger", "im.message.receive_v1"]);
      expect(handled).toEqual([
        {
          source: "message",
          chatId: "oc_1",
          messageId: "om_1",
          command: { type: "repo_select", repositoryIds: ["repo_1"] },
          shouldRespond: true
        },
        {
          source: "card",
          chatId: "oc_1",
          messageId: "om_2",
          command: { type: "push_repository", requirementId: "req_1", repositoryId: "repo_1" },
          shouldRespond: true
        }
      ]);
      expect(consoleInfo).toHaveBeenCalledWith("Feishu message event received", expect.any(Object));
      expect(consoleInfo).toHaveBeenCalledWith("Feishu message routed", expect.any(Object));
    } finally {
      expect(consoleInfo).toHaveBeenCalled();
    }
  });

  it("does not handle the same source and message id twice", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const handled: unknown[] = [];

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      { appId: "cli_xxx", appSecret: "secret_xxx", botOpenId: "ou_bot" },
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      }
    );

    await runtime.start();
    const event: FeishuMessageReceiveEvent = {
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_1 hello" }),
        mentions: [{ id: { open_id: "ou_bot" }, name: "bot", key: "@_user_1" }]
      }
    };
    await registered["im.message.receive_v1"]?.(event);
    await registered["im.message.receive_v1"]?.(event);
    await registered["card.action.trigger"]?.({
      action: {
        value: {
          action: "push_repository",
          requirementId: "req_1",
          repositoryId: "repo_1"
        }
      },
      context: { open_chat_id: "oc_1", open_message_id: "om_1" }
    });

    expect(handled).toHaveLength(2);
  });

  it("uses platform allow-list config before invoking handlers", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const handled: unknown[] = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      { appId: "cli_xxx", appSecret: "secret_xxx", allowFrom: "ou_allowed" },
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      }
    );

    try {
      await runtime.start();
      await registered["im.message.receive_v1"]?.({
        sender: { sender_type: "user", sender_id: { open_id: "ou_blocked" } },
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "/repo select web" })
        }
      });

      expect(handled).toEqual([]);
      expect(consoleWarn).toHaveBeenCalledWith(
        "Feishu message event ignored",
        expect.objectContaining({ reason: "blocked_by_options" })
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("forwards unmentioned group messages for recording without allowing responses", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const handled: unknown[] = [];

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      { appId: "cli_xxx", appSecret: "secret_xxx", botOpenId: "ou_bot" },
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      }
    );

    await runtime.start();
    await registered["im.message.receive_v1"]?.({
      sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_record_only",
        chat_id: "oc_1",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "只记录，不回复" }),
        mentions: []
      }
    });

    expect(handled).toEqual([
      {
        source: "message",
        chatId: "oc_1",
        messageId: "om_record_only",
        command: { type: "chat", raw: "只记录，不回复" },
        shouldRespond: false
      }
    ]);
  });

  it("catches handler failures without rejecting SDK callbacks", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      { appId: "cli_xxx", appSecret: "secret_xxx", botOpenId: "ou_bot" },
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async () => {
          throw new Error("handler failed");
        }
      }
    );

    try {
      await runtime.start();
      await expect(
        registered["im.message.receive_v1"]?.({
          message: {
            message_id: "om_1",
            chat_id: "oc_1",
            chat_type: "group",
            message_type: "text",
            content: JSON.stringify({ text: "@_user_1 /repo select web" }),
            mentions: [{ id: { open_id: "ou_bot" }, name: "bot", key: "@_user_1" }]
          }
        })
      ).resolves.toBeUndefined();
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledWith("Feishu message handler failed", expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });
});
