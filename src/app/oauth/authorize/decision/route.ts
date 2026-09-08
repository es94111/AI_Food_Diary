import { hostHeaderValidationResponse } from "@modelcontextprotocol/server";
import { requireUser } from "@/lib/auth";
import { getMcpRuntimeConfig, validateRequestOrigin } from "@/lib/mcp/config";
import {
  createAuthorizationCode,
  oauthErrorResponse,
  OAuthRequestError,
  verifyConsentToken,
} from "@/lib/mcp/oauth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizationRedirect(
  authorization: Awaited<ReturnType<typeof verifyConsentToken>>,
  issuer: string,
  values: Record<string, string>,
): Response {
  const target = new URL(authorization.redirectUri);
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  if (authorization.state) target.searchParams.set("state", authorization.state);
  target.searchParams.set("iss", issuer);
  return Response.redirect(target, 303);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const config = getMcpRuntimeConfig(request);
    const hostRejected = hostHeaderValidationResponse(request, config.allowedHosts);
    if (hostRejected) return hostRejected;
    const originRejected = validateRequestOrigin(request, [config.issuer.origin]);
    if (originRejected) return originRejected;
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new OAuthRequestError("access_denied", "Cross-site authorization submission was rejected.", 403);
    }
    const user = await requireUser();
    const limited = await enforceRateLimit(`mcp:oauth-consent:${user.id}`, {
      limit: 20,
      windowSec: 600,
      message: "OAuth authorization rate limit exceeded.",
    });
    if (limited) return limited;
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (contentType !== "application/x-www-form-urlencoded") {
      throw new OAuthRequestError("invalid_request", "Authorization decision must be form encoded.");
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16 * 1024) {
      throw new OAuthRequestError("invalid_request", "Authorization decision is too large.");
    }
    const body = new URLSearchParams(raw);
    const tokens = body.getAll("consent_token");
    const decisions = body.getAll("decision");
    if (tokens.length !== 1 || decisions.length !== 1 || tokens[0].length > 8_192) {
      throw new OAuthRequestError("invalid_request", "Authorization decision is invalid.");
    }
    const authorization = await verifyConsentToken(tokens[0], user.id, config);
    if (decisions[0] === "deny") {
      return authorizationRedirect(authorization, config.issuer.origin, {
        error: "access_denied",
        error_description: "The resource owner denied the request.",
      });
    }
    if (decisions[0] !== "approve") {
      throw new OAuthRequestError("invalid_request", "Authorization decision is invalid.");
    }
    const code = await createAuthorizationCode(user.id, authorization);
    return authorizationRedirect(authorization, config.issuer.origin, { code });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

