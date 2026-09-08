import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthMetadata,
  type OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/server";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getMcpOAuthSecret,
  getMcpRuntimeConfig,
  MCP_SCOPES,
  type McpRuntimeConfig,
} from "./config";

const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;
const BASE64URL_VALUE = /^[A-Za-z0-9_-]{43,128}$/;

const clientMetadataSchema = z
  .object({
    client_id: z.string().url().optional(),
    redirect_uris: z.array(z.string().url()).min(1),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
    token_endpoint_auth_method: z.string().optional(),
    client_name: z.string().max(200).optional(),
  })
  .passthrough();

type ClientMetadata = z.infer<typeof clientMetadataSchema>;
const clientMetadataCache = new Map<
  string,
  { expiresAt: number; value: ClientMetadata }
>();

export type ValidatedAuthorizationRequest = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
};

export class OAuthRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OAuthRequestError";
    this.code = code;
    this.status = status;
  }
}

function issuer(config: McpRuntimeConfig): string {
  return config.issuer.origin;
}

function resource(config: McpRuntimeConfig): string {
  return config.publicUrl.toString();
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireSingle(
  params: URLSearchParams,
  name: string,
  { optional = false, max = 2_048 }: { optional?: boolean; max?: number } = {},
): string | undefined {
  const values = params.getAll(name);
  if (values.length === 0 && optional) return undefined;
  if (values.length !== 1 || !values[0] || values[0].length > max) {
    throw new OAuthRequestError("invalid_request", `Invalid ${name}.`);
  }
  return values[0];
}

async function loadCimdMetadata(
  clientId: string,
  config: McpRuntimeConfig,
): Promise<ClientMetadata | null> {
  if (!clientId.startsWith("https://")) return null;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.MCP_OAUTH_VALIDATE_CIMD === "false"
  ) {
    return null;
  }
  const cached = clientMetadataCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const target = new URL(clientId);
  if (
    !config.allowedClientIds.includes(target.toString()) ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new OAuthRequestError("unauthorized_client", "OAuth client is not allowed.", 403);
  }

  const response = await fetch(target, {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    throw new OAuthRequestError(
      "invalid_client",
      "OAuth client metadata could not be verified.",
      401,
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 32 * 1024) {
    throw new OAuthRequestError("invalid_client", "OAuth client metadata is too large.", 401);
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > 32 * 1024) {
    throw new OAuthRequestError("invalid_client", "OAuth client metadata is too large.", 401);
  }
  let parsed: ClientMetadata;
  try {
    parsed = clientMetadataSchema.parse(JSON.parse(raw));
  } catch {
    throw new OAuthRequestError("invalid_client", "OAuth client metadata is invalid.", 401);
  }
  if (parsed.client_id && parsed.client_id !== clientId) {
    throw new OAuthRequestError("invalid_client", "OAuth client identity mismatch.", 401);
  }
  const methods = parsed.token_endpoint_auth_methods_supported ??
    (parsed.token_endpoint_auth_method
      ? [parsed.token_endpoint_auth_method]
      : []);
  if (!methods.includes("none")) {
    throw new OAuthRequestError(
      "unauthorized_client",
      "OAuth client does not support the configured public-client token exchange.",
      403,
    );
  }
  clientMetadataCache.set(clientId, {
    value: parsed,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return parsed;
}

function parseScopes(raw: string | undefined): string[] {
  const requested = raw ? raw.split(/\s+/).filter(Boolean) : [...MCP_SCOPES];
  const scopes = [...new Set(requested)];
  if (scopes.length === 0 || scopes.some((scope) => !MCP_SCOPES.includes(scope as never))) {
    throw new OAuthRequestError("invalid_scope", "One or more requested scopes are not supported.");
  }
  return scopes;
}

export async function validateAuthorizationRequest(
  params: URLSearchParams,
  config = getMcpRuntimeConfig(),
): Promise<ValidatedAuthorizationRequest> {
  if (requireSingle(params, "response_type") !== "code") {
    throw new OAuthRequestError("unsupported_response_type", "Only response_type=code is supported.");
  }
  const clientId = requireSingle(params, "client_id") as string;
  const redirectUri = requireSingle(params, "redirect_uri") as string;
  const requestedResource = requireSingle(params, "resource") as string;
  const codeChallenge = requireSingle(params, "code_challenge", { max: 128 }) as string;
  const codeChallengeMethod = requireSingle(params, "code_challenge_method", { max: 16 });
  const state = requireSingle(params, "state", { optional: true, max: 1_024 });
  const scope = requireSingle(params, "scope", { optional: true, max: 1_024 });

  if (!config.allowedClientIds.includes(clientId)) {
    throw new OAuthRequestError("unauthorized_client", "OAuth client is not allowed.", 403);
  }
  if (!config.allowedRedirectUris.includes(redirectUri)) {
    throw new OAuthRequestError("invalid_request", "OAuth redirect URI is not allowed.");
  }
  if (requestedResource !== resource(config)) {
    throw new OAuthRequestError("invalid_target", "OAuth resource does not match this MCP server.");
  }
  if (codeChallengeMethod !== "S256" || !BASE64URL_VALUE.test(codeChallenge)) {
    throw new OAuthRequestError("invalid_request", "PKCE S256 is required.");
  }

  const metadata = await loadCimdMetadata(clientId, config);
  if (metadata && !metadata.redirect_uris.includes(redirectUri)) {
    throw new OAuthRequestError("invalid_request", "Redirect URI is not registered by the OAuth client.");
  }

  return {
    clientId,
    clientName: metadata?.client_name ?? "ChatGPT",
    redirectUri,
    resource: requestedResource,
    scopes: parseScopes(scope),
    state,
    codeChallenge,
  };
}

export async function createAuthorizationCode(
  userId: string,
  request: ValidatedAuthorizationRequest,
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await prisma.mcpOAuthAuthorizationCode.create({
    data: {
      codeHash: hashSecret(code),
      userId,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      resource: request.resource,
      codeChallenge: request.codeChallenge,
      scopes: request.scopes,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    },
  });
  return code;
}

const consentClaimsSchema = z.object({
  sub: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().max(200),
  redirectUri: z.string().url(),
  resource: z.string().url(),
  scopes: z.array(z.string()).min(1),
  state: z.string().max(1_024).optional(),
  codeChallenge: z.string().regex(BASE64URL_VALUE),
});

export async function createConsentToken(
  userId: string,
  request: ValidatedAuthorizationRequest,
  config = getMcpRuntimeConfig(),
): Promise<string> {
  return new SignJWT({
    clientId: request.clientId,
    clientName: request.clientName,
    redirectUri: request.redirectUri,
    resource: request.resource,
    scopes: request.scopes,
    state: request.state,
    codeChallenge: request.codeChallenge,
  })
    .setProtectedHeader({ alg: "HS256", typ: "oauth-consent+jwt" })
    .setIssuer(issuer(config))
    .setAudience(`${issuer(config)}/oauth/authorize`)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getMcpOAuthSecret());
}

export async function verifyConsentToken(
  token: string,
  expectedUserId: string,
  config = getMcpRuntimeConfig(),
): Promise<ValidatedAuthorizationRequest> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, getMcpOAuthSecret(), {
      algorithms: ["HS256"],
      issuer: issuer(config),
      audience: `${issuer(config)}/oauth/authorize`,
      subject: expectedUserId,
    });
    if (protectedHeader.typ !== "oauth-consent+jwt") throw new Error("invalid consent token type");
    const parsed = consentClaimsSchema.parse(payload);
    if (
      !config.allowedClientIds.includes(parsed.clientId) ||
      !config.allowedRedirectUris.includes(parsed.redirectUri) ||
      parsed.resource !== resource(config) ||
      parsed.scopes.some((scope) => !MCP_SCOPES.includes(scope as never))
    ) {
      throw new Error("consent claims no longer allowed");
    }
    return {
      clientId: parsed.clientId,
      clientName: parsed.clientName,
      redirectUri: parsed.redirectUri,
      resource: parsed.resource,
      scopes: parsed.scopes,
      state: parsed.state,
      codeChallenge: parsed.codeChallenge,
    };
  } catch {
    throw new OAuthRequestError("invalid_request", "Authorization consent has expired or is invalid.");
  }
}

async function issueAccessToken(
  user: { id: string; tokenVersion: number },
  clientId: string,
  scopes: string[],
  config: McpRuntimeConfig,
): Promise<string> {
  return new SignJWT({
    client_id: clientId,
    scope: scopes.join(" "),
    tv: user.tokenVersion,
    actor_source: "chatgpt_mcp",
  })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(issuer(config))
    .setAudience(resource(config))
    .setSubject(user.id)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS)
    .sign(getMcpOAuthSecret());
}

export async function exchangeAuthorizationCode(
  params: URLSearchParams,
  config = getMcpRuntimeConfig(),
): Promise<{ access_token: string; token_type: "Bearer"; expires_in: number; scope: string }> {
  if (requireSingle(params, "grant_type") !== "authorization_code") {
    throw new OAuthRequestError("unsupported_grant_type", "Only authorization_code is supported.");
  }
  const code = requireSingle(params, "code", { max: 512 }) as string;
  const clientId = requireSingle(params, "client_id") as string;
  const redirectUri = requireSingle(params, "redirect_uri") as string;
  const requestedResource = requireSingle(params, "resource") as string;
  const verifier = requireSingle(params, "code_verifier", { max: 128 }) as string;
  if (!PKCE_VALUE.test(verifier)) {
    throw new OAuthRequestError("invalid_grant", "Invalid PKCE verifier.");
  }
  if (!config.allowedClientIds.includes(clientId)) {
    throw new OAuthRequestError("invalid_client", "OAuth client is not allowed.", 401);
  }
  if (requestedResource !== resource(config)) {
    throw new OAuthRequestError("invalid_target", "OAuth resource does not match this MCP server.");
  }

  const stored = await prisma.mcpOAuthAuthorizationCode.findUnique({
    where: { codeHash: hashSecret(code) },
    include: { user: { select: { id: true, tokenVersion: true, isDisabled: true } } },
  });
  if (
    !stored ||
    stored.redeemedAt ||
    stored.expiresAt.getTime() <= Date.now() ||
    stored.clientId !== clientId ||
    stored.redirectUri !== redirectUri ||
    stored.resource !== requestedResource ||
    stored.user.isDisabled
  ) {
    throw new OAuthRequestError("invalid_grant", "Authorization code is invalid or expired.");
  }
  const derivedChallenge = hashSecret(verifier);
  if (!constantTimeEqual(derivedChallenge, stored.codeChallenge)) {
    throw new OAuthRequestError("invalid_grant", "Authorization code is invalid or expired.");
  }

  const consumed = await prisma.mcpOAuthAuthorizationCode.updateMany({
    where: { id: stored.id, redeemedAt: null, expiresAt: { gt: new Date() } },
    data: { redeemedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new OAuthRequestError("invalid_grant", "Authorization code is invalid or expired.");
  }

  return {
    access_token: await issueAccessToken(stored.user, clientId, stored.scopes, config),
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: stored.scopes.join(" "),
  };
}

export async function verifyMcpAccessToken(
  token: string,
  config = getMcpRuntimeConfig(),
): Promise<AuthInfo> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, getMcpOAuthSecret(), {
      algorithms: ["HS256"],
      issuer: issuer(config),
      audience: resource(config),
    });
    if (
      protectedHeader.typ !== "at+jwt" ||
      typeof payload.sub !== "string" ||
      typeof payload.client_id !== "string" ||
      typeof payload.scope !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.tv !== "number"
    ) {
      throw new Error("invalid token claims");
    }
    if (!config.allowedClientIds.includes(payload.client_id)) {
      throw new Error("OAuth client is no longer allowed");
    }
    const scopes = payload.scope.split(/\s+/).filter(Boolean);
    if (scopes.some((scope) => !MCP_SCOPES.includes(scope as never))) {
      throw new Error("invalid token scope");
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, tokenVersion: true, isDisabled: true },
    });
    if (!user || user.isDisabled || user.tokenVersion !== payload.tv) {
      throw new Error("revoked token");
    }
    return {
      token,
      clientId: payload.client_id,
      scopes,
      expiresAt: payload.exp,
      resource: config.publicUrl,
      extra: { userId: user.id },
    };
  } catch {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "The access token is invalid or expired.");
  }
}

export function getMcpUserId(authInfo: AuthInfo | undefined): string {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string") {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "The access token has no user identity.");
  }
  return userId;
}

export function oauthServerMetadata(
  config = getMcpRuntimeConfig(),
): OAuthMetadata {
  return {
    issuer: issuer(config),
    authorization_endpoint: `${issuer(config)}/oauth/authorize`,
    token_endpoint: `${issuer(config)}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...MCP_SCOPES],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
  };
}

export function protectedResourceMetadata(
  config = getMcpRuntimeConfig(),
): OAuthProtectedResourceMetadata {
  return {
    resource: resource(config),
    authorization_servers: [issuer(config)],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "AI Food Diary MCP",
  };
}

export function oauthErrorResponse(error: unknown): Response {
  if (error instanceof OAuthRequestError) {
    return Response.json(
      { error: error.code, error_description: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
  }
  console.error("OAuth request failed", error);
  return Response.json(
    { error: "server_error", error_description: "The authorization server could not complete the request." },
    { status: 500, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
