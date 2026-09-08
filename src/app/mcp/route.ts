import {
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { getClientIp } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  getMcpRuntimeConfig,
  MCP_TOOL_SCOPES,
  validateRequestOrigin,
} from "@/lib/mcp/config";
import { verifyMcpAccessToken } from "@/lib/mcp/oauth";
import {
  mcpToolNameFromRequest,
  parseMcpJsonBody,
  validateMcpProtocolRequest,
} from "@/lib/mcp/protocol";
import { aiFoodMcpHandler } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_TIMEOUT_MS = 30_000;

function methodNotAllowed(): Response {
  return Response.json(
    {
      code: "METHOD_NOT_ALLOWED",
      message: "MCP 2026-07-28 uses stateless POST requests only.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

async function withTimeout(work: Promise<Response>): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((resolve) => {
    timer = setTimeout(
      () =>
        resolve(
          Response.json(
            { code: "MCP_TIMEOUT", message: "The MCP request timed out." },
            { status: 504 },
          ),
        ),
      MCP_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request): Promise<Response> {
  let config;
  try {
    config = getMcpRuntimeConfig(request);
  } catch (error) {
    console.error("MCP configuration error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { code: "MCP_NOT_CONFIGURED", message: "The MCP service is unavailable." },
      { status: 503 },
    );
  }

  const hostRejected = hostHeaderValidationResponse(request, config.allowedHosts);
  if (hostRejected) return hostRejected;
  const originRejected = validateRequestOrigin(request, config.allowedOrigins);
  if (originRejected) return originRejected;

  const clientIp = getClientIp(request) ?? "untrusted";
  const ipLimited = await enforceRateLimit(`mcp:ip:${clientIp}`, {
    limit: clientIp === "untrusted" ? 300 : 180,
    windowSec: 300,
    message: "MCP request rate limit exceeded.",
  });
  if (ipLimited) return ipLimited;

  const parsed = await parseMcpJsonBody(request);
  if (parsed.rejection) return parsed.rejection;
  const protocolRejected = validateMcpProtocolRequest(request, parsed.body);
  if (protocolRejected) return protocolRejected;

  const toolName = mcpToolNameFromRequest(parsed.body);
  const requiredScope = toolName ? MCP_TOOL_SCOPES[toolName] : undefined;
  const authenticate = requireBearerAuth({
    verifier: {
      verifyAccessToken: (token) => verifyMcpAccessToken(token, config),
    },
    ...(requiredScope ? { requiredScopes: [requiredScope] } : {}),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(config.publicUrl),
  });
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;

  const userId = auth.extra?.userId;
  if (typeof userId !== "string") {
    return Response.json(
      { code: "UNAUTHORIZED", message: "The access token has no user identity." },
      { status: 401 },
    );
  }
  const userLimited = await enforceRateLimit(`mcp:user:${userId}`, {
    limit: 120,
    windowSec: 300,
    message: "MCP request rate limit exceeded.",
  });
  if (userLimited) return userLimited;
  if (toolName?.startsWith("create_")) {
    const createLimited = await enforceRateLimit(`mcp:create:${userId}`, {
      limit: 40,
      windowSec: 600,
      message: "MCP create rate limit exceeded.",
    });
    if (createLimited) return createLimited;
  }

  const response = await withTimeout(
    aiFoodMcpHandler.fetch(request, {
      authInfo: auth,
      parsedBody: parsed.body,
    }),
  );
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}

