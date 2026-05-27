import { describe, expect, it } from "vitest";
import {
  extractBotMenuCommand,
  extractCardActionCommand,
  extractTextMessageCommand,
  explainTextMessageCommand
} from "../../src/feishu/feishu-event-adapter.js";

describe("feishu event adapter", () => {
  it("extracts text message commands from im.message.receive_v1 events", () => {
    const parsed = extractTextMessageCommand({
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "/repo select repo_1 repo_2" })
      }
    });

    expect(parsed).toEqual({
      chatId: "oc_1",
      messageId: "om_1",
      shouldRespond: true,
      command: { type: "repo_select", repositoryIds: ["repo_1", "repo_2"] }
    });
  });

  it("returns null for non-text messages", () => {
    expect(
      extractTextMessageCommand({
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "image",
          content: "{}"
        }
      })
    ).toBeNull();
  });

  it("returns null for messages sent by the app itself", () => {
    expect(
      extractTextMessageCommand({
        sender: {
          sender_type: "app"
        },
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "收到需求，正在交给 Claude Code 分析..." })
        }
      })
    ).toBeNull();
  });

  it("explains why a text message event was ignored", () => {
    expect(
      explainTextMessageCommand({
        sender: { sender_type: "app" },
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "hello" })
        }
      })
    ).toEqual({ ok: false, drop: { reason: "app_sender" } });
  });

  it("routes select_static option clicks through action.option instead of action.value", () => {
    const parsed = extractCardActionCommand({
      action: {
        tag: "select_static",
        option: "nav:/command whoami",
        value: { session_key: "feishu:oc_1:channel" }
      },
      context: { open_chat_id: "oc_1", open_message_id: "om_1" }
    });

    expect(parsed).toEqual({
      chatId: "oc_1",
      messageId: "om_1",
      shouldRespond: true,
      command: {
        type: "platform_action",
        action: {
          kind: "nav",
          command: "/command",
          args: "whoami",
          raw: "nav:/command whoami"
        },
        sessionKey: "feishu:oc_1:channel"
      }
    });
  });

  it("falls back to action.value when no option is chosen (button click)", () => {
    const parsed = extractCardActionCommand({
      action: {
        value: {
          action: "push_repository",
          requirementId: "req_1",
          repositoryId: "repo_1"
        }
      },
      context: {
        open_chat_id: "oc_1",
        open_message_id: "om_1"
      }
    });

    expect(parsed).toEqual({
      chatId: "oc_1",
      messageId: "om_1",
      shouldRespond: true,
      command: { type: "push_repository", requirementId: "req_1", repositoryId: "repo_1" }
    });
  });

  it("merges Feishu form_submit values from action.form_value into card action commands", () => {
    const parsed = extractCardActionCommand({
      action: {
        value: {
          action: "act:/workbench plan revise submit",
          plan_id: "plan_1",
          version: "2"
        },
        form_value: {
          revision_note: "Add Playwright verification"
        }
      } as never,
      context: {
        open_chat_id: "oc_1",
        open_message_id: "om_1"
      }
    });

    expect(parsed).toEqual({
      chatId: "oc_1",
      messageId: "om_1",
      shouldRespond: true,
      command: {
        type: "workbench_plan_revision_submit",
        planId: "plan_1",
        version: 2,
        revisionNote: "Add Playwright verification"
      }
    });
  });

  it("keeps unmentioned group messages for recording while marking them as non-responsive", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "hello" }),
          mentions: []
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_bot",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: false,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("hello");
    expect(parsed?.command).toEqual({ type: "chat", raw: "hello" });
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("keeps group messages without bot open id for recording but does not allow responses", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "hello" }),
          mentions: []
        }
      },
      {
        platform: "feishu",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: false,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("hello");
    expect(parsed?.command).toEqual({ type: "chat", raw: "hello" });
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("allows direct messages to respond without bot open id", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_p2p",
          chat_id: "ou_1",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "hello" })
        }
      },
      {
        platform: "feishu",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: false,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("hello");
    expect(parsed?.shouldRespond).toBe(true);
  });

  it("does not let groupReplyAll bypass the group mention requirement", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_group",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "hello" }),
          mentions: []
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_bot",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: true,
        shareSessionInChannel: false,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("hello");
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("does not respond to group messages that mention someone other than the bot", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_other_mention",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_2 你看下这个" }),
          mentions: [{ id: { open_id: "ou_teammate" }, name: "teammate", key: "@_user_2" }]
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_bot",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: true,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("@_user_2 你看下这个");
    expect(parsed?.command).toEqual({ type: "chat", raw: "@_user_2 你看下这个" });
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("normalizes mentioned group text into a platform message", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_2",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 做一个需求" }),
          mentions: [{ id: { open_id: "ou_bot" }, name: "bot", key: "@_user_1" }]
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_bot",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: true,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("做一个需求");
    expect(parsed?.message.sessionKey).toBe("feishu:oc_1:channel");
    expect(parsed?.command).toEqual({ type: "chat", raw: "做一个需求" });
    expect(parsed?.shouldRespond).toBe(true);
  });

  it("recognizes bot mentions by user id when open id is unavailable", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_user_id_mention",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 做一个需求" }),
          mentions: [{ id: { user_id: "bot_user_id" }, name: "bot", key: "@_user_1" }]
        }
      },
      {
        platform: "feishu",
        botOpenId: "bot_user_id",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: true,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("做一个需求");
    expect(parsed?.shouldRespond).toBe(true);
  });

  it("does not treat a single leading non-bot mention as bot-directed", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_single_leading_mention",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 /help" }),
          mentions: [{ id: { open_id: "ou_actual_bot" }, name: "bot", key: "@_user_1" }]
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_configured_wrong",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: true,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("@_user_1 /help");
    expect(parsed?.command).toEqual({ type: "help", groupKey: undefined });
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("does not respond to slash commands when Feishu removed a non-bot mention token", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_mentioned_help",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "/help" }),
          mentions: [{ id: { open_id: "ou_actual_bot" }, name: "bot", key: "@_user_1" }]
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_configured_wrong",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: true,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("/help");
    expect(parsed?.command).toEqual({ type: "help", groupKey: undefined });
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("does not respond to natural language when Feishu removed a non-bot mention token", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_mentioned_text",
          chat_id: "oc_1",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "test" }),
          mentions: [{ id: { open_id: "ou_actual_bot" }, name: "bot", key: "@_user_1" }]
        }
      },
      {
        platform: "feishu",
        botOpenId: "ou_configured_wrong",
        allowFrom: "*",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: true,
        threadIsolation: false
      }
    );

    expect(parsed?.message.text).toBe("test");
    expect(parsed?.command).toEqual({ type: "chat", raw: "test" });
    expect(parsed?.shouldRespond).toBe(false);
  });

  it("drops messages blocked by allow lists", () => {
    const parsed = extractTextMessageCommand(
      {
        sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_3",
          chat_id: "oc_1",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "hello" })
        }
      },
      {
        platform: "feishu",
        allowFrom: "ou_2",
        allowChat: "*",
        groupOnly: false,
        groupReplyAll: false,
        shareSessionInChannel: false,
        threadIsolation: false
      }
    );

    expect(parsed).toBeNull();
  });
});

describe("extractBotMenuCommand", () => {
  it("treats event_key as a slash command and routes via the operator's DM scope", () => {
    let tick = 1_700_000_000_000;
    const envelope = extractBotMenuCommand(
      {
        event: {
          event_key: "help",
          operator: { operator_id: { open_id: "ou_alice" } }
        }
      },
      { now: () => tick++ }
    );
    expect(envelope).not.toBeNull();
    expect(envelope?.chatId).toBe("ou_alice");
    expect(envelope?.messageId).toMatch(/^menu:ou_alice:help:\d+$/);
    expect(envelope?.command).toEqual({ type: "help", groupKey: undefined });
  });

  it("prepends a slash when event_key is provided without one", () => {
    const envelope = extractBotMenuCommand({
      event_key: "list",
      operator: { operator_id: { open_id: "ou_alice" } }
    });
    expect(envelope?.command.type).toBe("slash_input");
  });

  it("returns null when event_key or operator id is missing", () => {
    expect(
      extractBotMenuCommand({ event: { operator: { operator_id: { open_id: "ou_alice" } } } })
    ).toBeNull();
    expect(extractBotMenuCommand({ event_key: "help" })).toBeNull();
  });
});
