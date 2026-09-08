import { hostHeaderValidationResponse } from "@modelcontextprotocol/server";
import { getMcpRuntimeConfig } from "@/lib/mcp/config";
import { exchangeAuthorizationCode, oauthErrorResponse, OAuthRequestError } from "@/lib/mcp/oauth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const config = getMcpRuntimeConfig(request);
    const hostRejected = hostHeaderValidationResponse(request, config.allowedHosts);
    if (hostRejected) return hostRejected;
    if (request.headers.has("authorization")) {
      throw new OAuthRequestError(
        "invalid_client",
        "This public OAuth client uses PKCE and token_endpoint_auth_method=none.",
        401,
      );
    }
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (contentType !== "application/x-www-form-urlencoded") {
      throw new OAuthRequestError("invalid_request", "Token requests must be form encoded.");
    }
    const ip = getClientIp(request) ?? "untrusted";
    const limited = await enforceRateLimit(`mcp:oauth-token:${ip}`, {
      limit: ip === "untrusted" ? 120 : 30,
      windowSec: 300,
      message: "OAuth token request rate limit exceeded.",
    });
    if (limited) return limited;
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) {
      throw new OAuthRequestError("invalid_request", "Token request is too large.");
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16 * 1024) {
      throw new OAuthRequestError("invalid_request", "Token request is too large.");
    }
    return Response.json(
      await exchangeAuthorizationCode(new URLSearchParams(raw), config),
      {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

