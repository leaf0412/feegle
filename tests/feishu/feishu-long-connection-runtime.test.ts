import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FeishuBotMenuEvent,
  type FeishuCardActionTriggerEvent,
  type FeishuMessageReceiveEvent,
  type FeishuMessageRecalledEvent
} from "@integrations/feishu/feishu-event-adapter.js";
import {
  FeishuLongConnectionRuntime
} from "@integrations/feishu/feishu-long-connection-runtime.js";
import type { FeishuPlatformConfig } from "@integrations/feishu/feishu-platform-config.js";

function fullConfig(overrides: Partial<FeishuPlatformConfig> = {}): FeishuPlatformConfig {
  return {
    appId: "cli_xxx", appSecret: "secret",
    enableInteractiveCards: true, allowFrom: "*", allowChat: "*",
    groupOnly: false, groupReplyAll: false, shareSessionInChannel: false,
    threadIsolation: false, replyToTrigger: true, progressStyle: "legacy",
    reactionEmoji: "OnIt",
    ...overrides
  };
}

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
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
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
      fullConfig({ verificationToken: "token", encryptKey: "encrypt", botOpenId: "ou_bot" }),
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
      // Message and card events: no ingress configured, both dropped with warnings.
      // Neither should call handler.handleCommand.
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
      expect(Object.keys(registered).sort()).toEqual([
        "application.bot.menu_v6",
        "card.action.trigger",
        "im.message.recalled_v1",
        "im.message.receive_v1"
      ]);
      // Neither message nor card action calls handleCommand
      expect(handled).toEqual([]);
      expect(consoleInfo).toHaveBeenCalledWith("Feishu message event received", expect.any(Object));
    } finally {
      expect(consoleInfo).toHaveBeenCalled();
    }
  });

  it("dispatches accepted message events to runtime ingress when configured and never calls handler.handleCommand", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const dispatched: unknown[] = [];
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
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (event) => {
          dispatched.push(event);
          return { status: "succeeded" };
        }
      }
    );

    await runtime.start();
    await registered["im.message.receive_v1"]?.({
      sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "hello" })
      }
    });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      triggerEventId: "feishu:om_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      external: { chatId: "oc_1", messageId: "om_1", commandType: "chat", shouldRespond: true },
      actorHint: { provider: "feishu", externalUserId: "ou_1" },
      conversationHint: { conversationKey: "feishu:oc_1" },
      payloadSummary: { commandType: "chat", textLength: 5 }
    });
    // handler.handleCommand must NOT be called for message events
    expect(handled).toHaveLength(0);
  });

  it("logs an explicit error when ingress dispatch fails and never calls handler.handleCommand", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const handled: unknown[] = [];
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
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (_event) => {
          return { status: "failed", reason: "intent unresolved: no matching workflow" };
        }
      }
    );

    await runtime.start();
    await registered["im.message.receive_v1"]?.({
      sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_fail",
        chat_id: "oc_1",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "hello" })
      }
    });

    // Ingress failure should be logged as an error
    expect(consoleError).toHaveBeenCalledWith(
      "Feishu ingress dispatch failed",
      expect.objectContaining({ status: "failed", reason: "intent unresolved: no matching workflow" })
    );
    // handler.handleCommand must NOT be called
    expect(handled).toHaveLength(0);
  });

  it("dispatches card action events to runtime ingress when configured", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
    } = {};
    const dispatched: unknown[] = [];
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
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (event) => {
          dispatched.push(event);
          return { status: "succeeded" };
        }
      }
    );

    await runtime.start();
    await registered["card.action.trigger"]?.({
      action: {
        value: {
          action: "act:/workbench plan approve",
          plan_id: "plan_1",
          version: 1
        }
      },
      context: { open_chat_id: "oc_card", open_message_id: "om_card_action" }
    });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      triggerEventId: "feishu:om_card_action",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "card_action" },
      external: { chatId: "oc_card", messageId: "om_card_action" }
    });
    // handler.handleCommand must NOT be called for card actions
    expect(handled).toHaveLength(0);
  });

  it("dedups card actions by callback token, not messageId, so an evolving card accepts successive clicks", async () => {
    const registered: {
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
    } = {};
    const dispatched: unknown[] = [];

    class FakeEventDispatcher {
      register(handles: { "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void> }): this {
        Object.assign(registered, handles);
        return this;
      }
    }
    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      { handleCommand: async () => {} },
      {
        dispatch: async (event) => {
          dispatched.push(event);
          return { status: "succeeded" as const };
        }
      }
    );
    await runtime.start();

    const click = (token: string) =>
      registered["card.action.trigger"]?.({
        token,
        action: { value: { action: "act:/requirement plan approve", requirement_id: "reqwf_1", plan_version: "1" } },
        context: { open_chat_id: "oc_card", open_message_id: "om_evolving" }
      });

    // same evolving card (one messageId), two distinct clicks → both dispatch
    await click("tok_first");
    await click("tok_second");
    // Feishu redelivery repeats a token → that one is deduped
    await click("tok_second");

    expect(dispatched).toHaveLength(2);
  });

  it("dispatches bot menu events through ingress instead of handleCommand when configured", async () => {
    const registered: {
      "application.bot.menu_v6"?: (event: FeishuBotMenuEvent) => Promise<void>;
    } = {};
    const dispatched: unknown[] = [];
    const handled: unknown[] = [];

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
        "application.bot.menu_v6"?: (event: FeishuBotMenuEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (event) => {
          dispatched.push(event);
          return { status: "succeeded" };
        }
      }
    );

    await runtime.start();
    await registered["application.bot.menu_v6"]?.({
      event: {
        event_key: "help",
        operator: { operator_id: { open_id: "ou_bob" } }
      }
    });

    // Bot menu should go through ingress, NOT through the legacy handler
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "bot_menu" },
      external: { chatId: "ou_bob" }
    });
    expect(handled).toHaveLength(0);
  });

  it("drops bot menu events when ingress is not configured", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
      "application.bot.menu_v6"?: (event: FeishuBotMenuEvent) => Promise<void>;
    } = {};
    const handled: unknown[] = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
        "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
        "application.bot.menu_v6"?: (event: FeishuBotMenuEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      { handleCommand: async (input) => { handled.push(input); } }
    );
    await runtime.start();
    await registered["application.bot.menu_v6"]?.({
      event: {
        event_key: "help",
        operator: { operator_id: { open_id: "ou_alice" } }
      }
    });
    // Bot menu event dropped — no ingress configured, no handler fallback
    expect(handled).toHaveLength(0);
    expect(consoleWarn).toHaveBeenCalledWith(
      "Feishu bot menu event dropped — no ingress configured",
      expect.any(Object)
    );
  });

  it("marks recalled message ids in the recall tracker", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
    } = {};

    class FakeEventDispatcher {
      register(handles: {
        "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
        "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
        "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
      }): this {
        Object.assign(registered, handles);
        return this;
      }
    }

    class FakeWSClient {
      async start(): Promise<void> {}
    }

    const runtime = new FeishuLongConnectionRuntime(
      fullConfig(),
      { EventDispatcher: FakeEventDispatcher, WSClient: FakeWSClient },
      { handleCommand: async () => {} }
    );
    await runtime.start();
    await registered["im.message.recalled_v1"]?.({ message_id: "om_recalled" });
    expect(runtime.recallTracker.isRecalled("om_recalled")).toBe(true);
  });

  it("does not handle the same message id twice", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
    } = {};
    const dispatchCalls: unknown[] = [];
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
      fullConfig({ botOpenId: "ou_bot" }),
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (event) => {
          dispatchCalls.push(event);
          return { status: "succeeded" };
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
    // First dispatch of the same message id
    await registered["im.message.receive_v1"]?.(event);
    // Second dispatch of the same message id — should be deduped
    await registered["im.message.receive_v1"]?.(event);
    // Card action with same message id — not deduped (different source prefix)
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

    // ingress.dispatch should be called for message (once, deduped) and card (once, different dedup prefix)
    expect(dispatchCalls).toHaveLength(2);
    // Neither message nor card action calls handler.handleCommand
    expect(handled).toHaveLength(0);
  });

  it("drops repeated card navigation actions without ingress", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
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
      fullConfig({ botOpenId: "ou_bot" }),
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
    await registered["card.action.trigger"]?.({
      action: { value: { action: "nav:/help agent" } },
      context: { open_chat_id: "oc_1", open_message_id: "om_help_card" }
    });
    await registered["card.action.trigger"]?.({
      action: { value: { action: "nav:/help repo" } },
      context: { open_chat_id: "oc_1", open_message_id: "om_help_card" }
    });

    // Card events dropped — no ingress configured, no handler fallback
    expect(handled).toEqual([]);
    // Only first card action triggers warning (second is deduped by card: prefix)
    expect(consoleWarn).toHaveBeenCalledWith(
      "Feishu card action dropped — no ingress configured",
      expect.any(Object)
    );
  });

  it("uses platform allow-list config before invoking dispatch", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
    } = {};
    const dispatchCalls: unknown[] = [];
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
      fullConfig({ allowFrom: "ou_allowed" }),
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (event) => {
          dispatchCalls.push(event);
          return { status: "succeeded" };
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

      // Blocked user: neither ingress.dispatch nor handleCommand called
      expect(dispatchCalls).toEqual([]);
      expect(handled).toEqual([]);
      expect(consoleWarn).toHaveBeenCalledWith(
        "Feishu message event ignored",
        expect.objectContaining({ reason: "blocked_by_options" })
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("forwards unmentioned group messages to ingress with shouldRespond: false", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
    } = {};
    const dispatchCalls: unknown[] = [];
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
      fullConfig({ botOpenId: "ou_bot" }),
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      },
      {
        dispatch: async (event) => {
          dispatchCalls.push(event);
          return { status: "succeeded" };
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

    // The message should go to ingress with shouldRespond: false
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toMatchObject({
      triggerEventId: "feishu:om_record_only",
      external: { chatId: "oc_1", messageId: "om_record_only", commandType: "chat", shouldRespond: false, chatType: "group" },
      actorHint: { provider: "feishu", externalUserId: "ou_1" }
    });
    // handler.handleCommand must NOT be called
    expect(handled).toHaveLength(0);
  });

  it("catches ingress dispatch errors without rejecting SDK callbacks", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
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
      fullConfig({ botOpenId: "ou_bot" }),
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async () => {
          throw new Error("handler should never be called for messages");
        }
      },
      {
        dispatch: async () => {
          throw new Error("ingress dispatch failed");
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

      expect(consoleError).toHaveBeenCalledWith("Feishu ingress dispatch threw", expect.any(Object));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("drops message when ingress is not configured with a warning", async () => {
    const registered: {
      "im.message.receive_v1"?: (event: FeishuMessageReceiveEvent) => Promise<void>;
      "card.action.trigger"?: (event: FeishuCardActionTriggerEvent) => Promise<void>;
      "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
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
      fullConfig({ botOpenId: "ou_bot" }),
      {
        EventDispatcher: FakeEventDispatcher,
        WSClient: FakeWSClient
      },
      {
        handleCommand: async (input) => {
          handled.push(input);
        }
      }
      // No ingress configured
    );

    await runtime.start();
    await registered["im.message.receive_v1"]?.({
      message: {
        message_id: "om_dropped",
        chat_id: "oc_1",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_1 hello" }),
        mentions: [{ id: { open_id: "ou_bot" }, name: "bot", key: "@_user_1" }]
      }
    });

    // No ingress configured: message dropped, warning logged, no handler call
    expect(consoleWarn).toHaveBeenCalledWith(
      "Feishu message dropped — no ingress configured",
      expect.any(Object)
    );
    expect(handled).toHaveLength(0);
  });
});
