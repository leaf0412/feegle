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

    const writeResponse = await this.requester.request({
      url: `/open-apis/docx/v1/documents/${input.documentId}/blocks/${input.documentId}/descendant`,
      method: "POST",
      data: {
        children_id: firstLevel,
        descendants: blocks,
        index: 0
      }
    });
    expectSuccess("writeBlocks", writeResponse);
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
