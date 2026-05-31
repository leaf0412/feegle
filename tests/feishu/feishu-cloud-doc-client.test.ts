import { describe, expect, it, vi } from "vitest";
import { HttpFeishuCloudDocClient, type FeishuRawRequester } from "../../src/integrations/feishu/feishu-cloud-doc-client.js";

function fakeRequester(
  handler: (req: {
    url: string;
    method: string;
    data?: unknown;
    params?: Record<string, string | number | undefined>;
  }) => unknown
): FeishuRawRequester {
  return {
    request: vi.fn().mockImplementation(async (req) => handler(req))
  };
}

describe("HttpFeishuCloudDocClient", () => {
  it("createDoc posts the title and returns document_id", async () => {
    const requester = fakeRequester((req) => {
      expect(req.url).toBe("/open-apis/docx/v1/documents");
      expect(req.method).toBe("POST");
      expect(req.data).toEqual({ title: "feegle plan" });
      return {
        code: 0,
        data: { document: { document_id: "doc_123", revision_id: 1, title: "feegle plan" } },
        msg: "success"
      };
    });
    const client = new HttpFeishuCloudDocClient(requester);

    const result = await client.createDoc({ title: "feegle plan" });

    expect(result).toEqual({ documentId: "doc_123" });
  });

  it("createDoc throws on non-zero code", async () => {
    const requester = fakeRequester(() => ({ code: 99991672, msg: "scope missing" }));
    const client = new HttpFeishuCloudDocClient(requester);

    await expect(client.createDoc({ title: "x" })).rejects.toThrow(
      "Feishu createDoc failed (code=99991672): scope missing"
    );
  });

  it("writeMarkdown converts then writes descendants under the doc root", async () => {
    const calls: Array<{ url: string; method: string; data?: unknown }> = [];
    const requester = fakeRequester((req) => {
      calls.push({ url: req.url, method: req.method, data: req.data });
      if (req.url.endsWith("/blocks/convert")) {
        return {
          code: 0,
          data: {
            blocks: [
              { block_id: "tmp_a", block_type: 3, heading1: {}, parent_id: "" },
              { block_id: "tmp_b", block_type: 2, text: {}, parent_id: "" }
            ],
            first_level_block_ids: ["tmp_a", "tmp_b"]
          }
        };
      }
      return { code: 0, data: { block_id_relations: [], children: [] } };
    });
    const client = new HttpFeishuCloudDocClient(requester);

    await client.writeMarkdown({ documentId: "doc_123", markdown: "# H\n\ntext" });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("/open-apis/docx/v1/documents/blocks/convert");
    expect(calls[0]?.data).toEqual({ content_type: "markdown", content: "# H\n\ntext" });
    expect(calls[1]?.url).toBe("/open-apis/docx/v1/documents/doc_123/blocks/doc_123/descendant");
    expect(calls[1]?.data).toMatchObject({
      children_id: ["tmp_a", "tmp_b"],
      descendants: [
        { block_id: "tmp_a", block_type: 3 },
        { block_id: "tmp_b", block_type: 2 }
      ],
      index: 0
    });
  });

  it("writeMarkdown skips the write call when the converter returns zero blocks", async () => {
    let writeCalled = false;
    const requester = fakeRequester((req) => {
      if (req.url.endsWith("/blocks/convert")) {
        return { code: 0, data: { blocks: [], first_level_block_ids: [] } };
      }
      writeCalled = true;
      return { code: 0, data: {} };
    });
    const client = new HttpFeishuCloudDocClient(requester);

    await client.writeMarkdown({ documentId: "doc_123", markdown: "" });

    expect(writeCalled).toBe(false);
  });

  it("deleteDoc DELETEs the drive file with type=docx", async () => {
    const requester = fakeRequester((req) => {
      expect(req.url).toBe("/open-apis/drive/v1/files/doc_123");
      expect(req.method).toBe("DELETE");
      expect(req.params).toEqual({ type: "docx" });
      return { code: 0, data: {} };
    });
    const client = new HttpFeishuCloudDocClient(requester);

    await client.deleteDoc({ documentId: "doc_123" });
  });

  it("buildDocUrl returns the canonical Feishu URL", () => {
    const client = new HttpFeishuCloudDocClient(fakeRequester(() => ({ code: 0, data: {} })));

    expect(client.buildDocUrl("doc_123")).toBe("https://feishu.cn/docx/doc_123");
  });

  it("buildDocUrl honors a custom base URL", () => {
    const client = new HttpFeishuCloudDocClient(fakeRequester(() => ({ code: 0, data: {} })), {
      docBaseUrl: "https://lark.com"
    });

    expect(client.buildDocUrl("doc_123")).toBe("https://lark.com/docx/doc_123");
  });
});
