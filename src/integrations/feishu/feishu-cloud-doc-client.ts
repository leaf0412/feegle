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

// Feishu's create-descendant API accepts up to 1000 blocks in a single call, and
// the whole converted tree must go in one call — the parent/child references are
// by temp id within that one `descendants` array. Splitting it across calls drops
// child references and Feishu rejects it (code 1770001 "invalid param").
const MAX_DESCENDANTS_PER_CALL = 1000;

export class HttpFeishuCloudDocClient implements FeishuCloudDocClientPort {
  private readonly docBaseUrl: string;

  constructor(
    private readonly requester: FeishuRawRequester,
    options: HttpFeishuCloudDocClientOptions = {}
  ) {
    this.docBaseUrl = options.docBaseUrl ?? "https://feishu.cn";
  }

  // The Lark SDK throws an AxiosError on an HTTP 4xx, with Feishu's {code,msg}
  // buried in response.data. Surface that instead of an opaque "status 400".
  private async request(operation: string, payload: Parameters<FeishuRawRequester["request"]>[0]): Promise<unknown> {
    try {
      return await this.requester.request(payload);
    } catch (error) {
      throw new Error(`Feishu ${operation} request failed: ${describeRequestError(error)}`);
    }
  }

  async createDoc(input: { title: string }): Promise<{ documentId: string }> {
    const response = await this.request("createDoc", {
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
    const convertResponse = await this.request("convertMarkdown", {
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
    if (blocks.length > MAX_DESCENDANTS_PER_CALL) {
      // The whole tree must go in one call; >1000 blocks needs incremental
      // parent-then-children writes (not built). Fail loud rather than truncate.
      throw new Error(
        `Plan converts to ${blocks.length} blocks, exceeding Feishu's ${MAX_DESCENDANTS_PER_CALL}-block descendant limit`
      );
    }

    const writeResponse = await this.request("writeBlocks", {
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
    const response = await this.request("deleteDoc", {
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

// Pull Feishu's {code,msg} out of an axios-style error (response.data), falling
// back to common error fields, so a 4xx surfaces the real reason not "status 400".
function describeRequestError(error: unknown): string {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const response = err.response as { data?: unknown; status?: unknown } | undefined;
    const data = response?.data;
    if (data && typeof data === "object") {
      const body = data as Record<string, unknown>;
      const code = body.code;
      const msg = body.msg ?? body.message;
      if (code !== undefined || msg !== undefined) {
        const status = response?.status !== undefined ? ` http=${String(response.status)}` : "";
        return `code=${String(code)} msg=${String(msg)}${status}`;
      }
    }
    if (typeof err.message === "string" && err.message.length > 0) {
      return err.message;
    }
  }
  return String(error);
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
