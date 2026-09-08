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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function authorizationRedirect(
  authorization: Awaited<ReturnType<typeof verifyConsentToken>>,
  issuer: string,
  values: Record<string, string>,
): Response {
  const target = new URL(authorization.redirectUri);
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  if (authorization.state) target.searchParams.set("state", authorization.state);
  target.searchParams.set("iss", issuer);
  const href = target.toString();
  // The site-wide CSP scopes `form-action` to 'self', and current Chrome,
  // Firefox, and Safari all enforce that directive against the *entire*
  // redirect chain following a form submission, not just its immediate
  // target. A raw Response.redirect() here would therefore be silently
  // blocked by the browser after this same-origin form POST, even though
  // the server-side response looks like a normal 303. Hand off with a
  // same-origin document instead: a script/meta-refresh bounce page is a
  // plain navigation, not a form submission, so form-action does not apply.
  const escapedHref = escapeHtml(href);
  const body = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${escapedHref}">
<title>正在返回</title></head>
<body>
<p>正在返回，如果沒有自動跳轉請點擊<a href="${escapedHref}">繼續</a>。</p>
<script>location.replace(${JSON.stringify(href)});</script>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
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

