export interface FeishuRawRequester {
  request(payload: {
    url: string;
    method: string;
    data?: unknown;
    params?: Record<string, string | number | undefined>;
  }): Promise<unknown>;
}

export interface FeishuCloudDocClientPort {
  createDoc(input: { title: string }): Promise<{ documentId: string }>;
  writeMarkdown(input: { documentId: string; markdown: string }): Promise<void>;
  deleteDoc(input: { documentId: string }): Promise<void>;
  buildDocUrl(documentId: string): string;
}

export interface HttpFeishuCloudDocClientOptions {
  docBaseUrl?: string;
}

interface ConvertResponseData {
  blocks: Array<Record<string, unknown> & { block_id: string }>;
  first_level_block_ids: string[];
}

type DocBlock = Record<string, unknown> & { block_id: string };

interface DescendantBatch {
  children_id: string[];
  descendants: DocBlock[];
  index: number;
}

// Feishu's create-descendant API accepts at most 50 blocks per call. Larger plans
// (tables, long step lists) must be written across several calls or the API 400s.
const MAX_DESCENDANTS_PER_CALL = 50;

export class HttpFeishuCloudDocClient implements FeishuCloudDocClientPort {
  private readonly docBaseUrl: string;

  constructor(
    private readonly requester: FeishuRawRequester,
    options: HttpFeishuCloudDocClientOptions = {}
  ) {
    this.docBaseUrl = options.docBaseUrl ?? "https://feishu.cn";
  }

  async createDoc(input: { title: string }): Promise<{ documentId: string }> {
    const response = await this.requester.request({
      url: "/open-apis/docx/v1/documents",
      method: "POST",
      data: { title: input.title }
    });
    const data = expectSuccess("createDoc", response);
    const documentId = readString(data, ["document", "document_id"]);
    if (!documentId) {
      throw new Error("Feishu createDoc response missing data.document.document_id");
    }
    return { documentId };
  }

  async writeMarkdown(input: { documentId: string; markdown: string }): Promise<void> {
    const convertResponse = await this.requester.request({
      url: "/open-apis/docx/v1/documents/blocks/convert",
      method: "POST",
      data: { content_type: "markdown", content: input.markdown }
    });
    const convertData = expectSuccess("convertMarkdown", convertResponse) as Partial<ConvertResponseData>;
    const blocks = Array.isArray(convertData.blocks) ? convertData.blocks : [];
    const firstLevel = Array.isArray(convertData.first_level_block_ids) ? convertData.first_level_block_ids : [];
    if (blocks.length === 0 || firstLevel.length === 0) {
      return;
    }

    const batches = splitIntoDescendantBatches(blocks, firstLevel, MAX_DESCENDANTS_PER_CALL);
    for (const batch of batches) {
      const writeResponse = await this.requester.request({
        url: `/open-apis/docx/v1/documents/${input.documentId}/blocks/${input.documentId}/descendant`,
        method: "POST",
        data: {
          children_id: batch.children_id,
          descendants: batch.descendants,
          index: batch.index
        }
      });
      expectSuccess("writeBlocks", writeResponse);
    }
  }

  async deleteDoc(input: { documentId: string }): Promise<void> {
    const response = await this.requester.request({
      url: `/open-apis/drive/v1/files/${input.documentId}`,
      method: "DELETE",
      params: { type: "docx" }
    });
    expectSuccess("deleteDoc", response);
  }

  buildDocUrl(documentId: string): string {
    return `${this.docBaseUrl}/docx/${documentId}`;
  }
}

// Walk one first-level block plus its full subtree (children referenced by id).
// The descendant call must carry a parent together with every block it links to,
// otherwise Feishu rejects the dangling child reference.
function collectClosure(rootId: string, byId: Map<string, DocBlock>): DocBlock[] {
  const closure: DocBlock[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const block = byId.get(id);
    if (!block) {
      continue;
    }
    closure.push(block);
    const children = Array.isArray(block.children) ? (block.children as string[]) : [];
    // push in reverse so the stack pops children back in document order (pre-order)
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }
  return closure;
}

// Pack first-level blocks (each with its subtree) into descendant batches of at
// most `max` blocks, preserving order. A parent and its children always stay in
// one batch; `index` tracks how many first-level blocks were already inserted so
// later batches append after earlier ones. A single subtree larger than `max` is
// sent alone — the API will surface that loudly rather than us silently dropping.
function splitIntoDescendantBatches(blocks: DocBlock[], firstLevel: string[], max: number): DescendantBatch[] {
  const byId = new Map(blocks.map((block) => [block.block_id, block]));
  const batches: DescendantBatch[] = [];
  let children: string[] = [];
  let descendants: DocBlock[] = [];
  let writtenFirstLevel = 0;

  const flush = (): void => {
    if (children.length === 0) {
      return;
    }
    batches.push({ children_id: children, descendants, index: writtenFirstLevel });
    writtenFirstLevel += children.length;
    children = [];
    descendants = [];
  };

  for (const rootId of firstLevel) {
    const closure = collectClosure(rootId, byId);
    if (children.length > 0 && descendants.length + closure.length > max) {
      flush();
    }
    children.push(rootId);
    descendants.push(...closure);
  }
  flush();
  return batches;
}

function expectSuccess(operation: string, response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error(`Feishu ${operation} returned a non-object response`);
  }
  const record = response as Record<string, unknown>;
  const code = typeof record.code === "number" ? record.code : -1;
  if (code !== 0) {
    const msg = typeof record.msg === "string" ? record.msg : "unknown error";
    throw new Error(`Feishu ${operation} failed (code=${code}): ${msg}`);
  }
  const data = record.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, path: ReadonlyArray<string>): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current !== "" ? current : undefined;
}
