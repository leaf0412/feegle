import { describe, expect, it } from "vitest";
import {
  extractCardActionCommand,
  extractTextMessageCommand
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

  it("extracts push card action commands from card.action.trigger events", () => {
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
      command: { type: "push_repository", requirementId: "req_1", repositoryId: "repo_1" }
    });
  });

  it("drops group messages without bot mention when groupReplyAll is false", () => {
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

    expect(parsed).toBeNull();
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
    expect(parsed?.command).toEqual({ type: "unknown", raw: "做一个需求" });
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
