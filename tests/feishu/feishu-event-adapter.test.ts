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
});
