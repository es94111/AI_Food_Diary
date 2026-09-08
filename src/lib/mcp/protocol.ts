import { MCP_SPEC_VERSION } from "./policy";

const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_META_KEY =
  "io.modelcontextprotocol/clientCapabilities";
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const HEADER_MISMATCH_CODE = -32020;
const UNSUPPORTED_PROTOCOL_VERSION_CODE = -32022;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestId(body: unknown): string | number | null {
  if (!isObject(body)) return null;
  return typeof body.id === "string" ||
    (typeof body.id === "number" && Number.isInteger(body.id))
    ? body.id
    : null;
}

function protocolError(
  body: unknown,
  code: number,
  message: string,
  data?: JsonObject,
  status = 400,
): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: requestId(body),
      error: { code, message, ...(data ? { data } : {}) },
    },
    { status },
  );
}

function mismatch(
  body: unknown,
  header: string,
  detail: string,
): Response {
  return protocolError(
    body,
    HEADER_MISMATCH_CODE,
    `Bad Request: the request headers and body disagree: ${detail}`,
    { mismatch: { header, body: detail } },
  );
}

export function validateMcpProtocolRequest(
  request: Request,
  body: unknown,
): Response | null {
  if (request.headers.has("mcp-session-id")) {
    return mismatch(
      body,
      "Mcp-Session-Id",
      "legacy MCP session identifiers are not supported",
    );
  }
  if (!isObject(body)) {
    return protocolError(body, -32600, "Invalid Request: expected one JSON-RPC request object.");
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return protocolError(body, -32600, "Invalid Request: malformed JSON-RPC request.");
  }
  if (body.method === "initialize" || body.method === "notifications/initialized") {
    return protocolError(
      body,
      -32601,
      `Method not found: ${body.method} was removed by MCP ${MCP_SPEC_VERSION}.`,
    );
  }

  const versionHeader = request.headers.get("mcp-protocol-version")?.trim();
  if (!versionHeader) {
    return mismatch(
      body,
      "(missing)",
      "the required MCP-Protocol-Version header is absent",
    );
  }
  if (versionHeader !== MCP_SPEC_VERSION) {
    return protocolError(
      body,
      UNSUPPORTED_PROTOCOL_VERSION_CODE,
      `Unsupported protocol version: ${versionHeader}.`,
      { supportedVersions: [MCP_SPEC_VERSION] },
    );
  }

  const params = isObject(body.params) ? body.params : null;
  const meta = params && isObject(params._meta) ? params._meta : null;
  if (!meta) {
    return protocolError(
      body,
      -32602,
      `Invalid params: MCP ${MCP_SPEC_VERSION} requires params._meta protocol metadata.`,
    );
  }
  if (meta[PROTOCOL_VERSION_META_KEY] !== MCP_SPEC_VERSION) {
    return mismatch(
      body,
      versionHeader,
      `params._meta.${PROTOCOL_VERSION_META_KEY} must equal ${MCP_SPEC_VERSION}`,
    );
  }
  if (!isObject(meta[CLIENT_CAPABILITIES_META_KEY])) {
    return protocolError(
      body,
      -32602,
      `Invalid params: params._meta.${CLIENT_CAPABILITIES_META_KEY} is required and must be an object.`,
    );
  }
  if (
    CLIENT_INFO_META_KEY in meta &&
    !isObject(meta[CLIENT_INFO_META_KEY])
  ) {
    return protocolError(
      body,
      -32602,
      `Invalid params: params._meta.${CLIENT_INFO_META_KEY} must be an object.`,
    );
  }

  const methodHeader = request.headers.get("mcp-method")?.trim();
  if (!methodHeader) {
    return mismatch(
      body,
      "(missing)",
      `the body names method ${body.method} but the required Mcp-Method header is absent`,
    );
  }
  if (methodHeader !== body.method) {
    return mismatch(
      body,
      methodHeader,
      `the body names method ${body.method} but the Mcp-Method header names ${methodHeader}`,
    );
  }

  const nameField =
    body.method === "tools/call" || body.method === "prompts/get"
      ? "name"
      : body.method === "resources/read"
        ? "uri"
        : null;
  if (nameField && typeof params?.[nameField] === "string") {
    const nameHeader = request.headers.get("mcp-name")?.trim();
    if (!nameHeader) {
      return mismatch(
        body,
        "(missing)",
        `the body carries params.${nameField} but the required Mcp-Name header is absent`,
      );
    }
    // The SDK performs the authoritative SEP-2243 Base64-sentinel decoding,
    // character validation, and decoded body comparison. This edge guard
    // only rejects an unencoded mismatch; encoded values must reach the SDK.
    if (
      !nameHeader.startsWith("=?base64?") &&
      nameHeader !== params[nameField]
    ) {
      return mismatch(
        body,
        nameHeader,
        `the body and Mcp-Name header name different targets`,
      );
    }
  }

  return null;
}

export function mcpToolNameFromRequest(body: unknown): string | null {
  if (!isObject(body) || body.method !== "tools/call" || !isObject(body.params)) {
    return null;
  }
  return typeof body.params.name === "string" ? body.params.name : null;
}

export async function parseMcpJsonBody(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<{ body?: unknown; rejection?: Response }> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    return {
      rejection: Response.json(
        { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
        { status: 415 },
      ),
    };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      rejection: Response.json(
        { code: "REQUEST_TOO_LARGE", message: "MCP request exceeds the size limit." },
        { status: 413 },
      ),
    };
  }
  const raw = await request.clone().text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return {
      rejection: Response.json(
        { code: "REQUEST_TOO_LARGE", message: "MCP request exceeds the size limit." },
        { status: 413 },
      ),
    };
  }
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return {
      rejection: protocolError(null, -32700, "Parse error: request body is not valid JSON."),
    };
  }
}
