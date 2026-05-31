import { describe, expect, it, vi } from "vitest";
import { HttpFeishuCloudDocClient, type FeishuRawRequester } from "@integrations/feishu/feishu-cloud-doc-client.js";

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

  it("writeMarkdown splits >50 blocks into multiple descendant calls with incrementing index", async () => {
    // A big plan converts to many first-level blocks. The descendant API caps at
    // 50 blocks/call, so a single write would 400 — these must be batched.
    const total = 120;
    const ids = Array.from({ length: total }, (_, i) => `tmp_${i}`);
    const blocks = ids.map((id) => ({ block_id: id, block_type: 2, text: {}, parent_id: "" }));
    const writeCalls: Array<{ children_id: string[]; index: number; count: number }> = [];
    const requester = fakeRequester((req) => {
      if (req.url.endsWith("/blocks/convert")) {
        return { code: 0, data: { blocks, first_level_block_ids: ids } };
      }
      const data = req.data as { children_id: string[]; descendants: unknown[]; index: number };
      writeCalls.push({ children_id: data.children_id, index: data.index, count: data.descendants.length });
      return { code: 0, data: {} };
    });
    const client = new HttpFeishuCloudDocClient(requester);

    await client.writeMarkdown({ documentId: "doc_123", markdown: "big" });

    expect(writeCalls).toHaveLength(3);
    expect(writeCalls.map((c) => c.count)).toEqual([50, 50, 20]);
    expect(writeCalls.map((c) => c.index)).toEqual([0, 50, 100]);
    // every block is written exactly once, in order, across the batches
    const written = writeCalls.flatMap((c) => c.children_id);
    expect(written).toEqual(ids);
  });

  it("writeMarkdown never splits a parent block away from its children", async () => {
    // 49 paragraphs then a table whose 3-block subtree would overflow the first
    // batch. The table must move whole into the next batch, not be torn apart —
    // a dangling child reference makes Feishu reject the descendant call.
    const paragraphs = Array.from({ length: 49 }, (_, i) => `p_${i}`);
    const tableSubtree = ["table", "cell_a", "cell_b"];
    const blocks = [
      ...paragraphs.map((id) => ({ block_id: id, block_type: 2, text: {}, parent_id: "" })),
      { block_id: "table", block_type: 31, table: {}, parent_id: "", children: ["cell_a", "cell_b"] },
      { block_id: "cell_a", block_type: 32, table_cell: {}, parent_id: "table" },
      { block_id: "cell_b", block_type: 32, table_cell: {}, parent_id: "table" }
    ];
    const writeCalls: Array<{ children_id: string[]; ids: string[] }> = [];
    const requester = fakeRequester((req) => {
      if (req.url.endsWith("/blocks/convert")) {
        return { code: 0, data: { blocks, first_level_block_ids: [...paragraphs, "table"] } };
      }
      const data = req.data as { children_id: string[]; descendants: Array<{ block_id: string }> };
      writeCalls.push({ children_id: data.children_id, ids: data.descendants.map((b) => b.block_id) });
      return { code: 0, data: {} };
    });
    const client = new HttpFeishuCloudDocClient(requester);

    await client.writeMarkdown({ documentId: "doc_123", markdown: "table plan" });

    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]?.children_id).toEqual(paragraphs);
    expect(writeCalls[1]?.children_id).toEqual(["table"]);
    // the table batch carries the whole subtree together
    expect(writeCalls[1]?.ids).toEqual(tableSubtree);
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
