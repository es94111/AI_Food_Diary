const CHATGPT_CIMD_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
const CHATGPT_STABLE_REDIRECT_URI =
  "https://chatgpt.com/connector_platform_oauth_redirect";

export const MCP_SCOPES = [
  "meals:read",
  "meals:create",
  "saved_foods:read",
  "saved_foods:create",
  "water_logs:read",
  "water_logs:create",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_TOOL_SCOPES: Readonly<Record<string, McpScope>> = {
  list_meals: "meals:read",
  get_meal: "meals:read",
  search_meals: "meals:read",
  list_saved_foods: "saved_foods:read",
  search_saved_foods: "saved_foods:read",
  list_water_logs: "water_logs:read",
  create_meal: "meals:create",
  create_saved_food: "saved_foods:create",
  create_water_log: "water_logs:create",
};

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function canonicalUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query, or fragment`);
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error(`${label} must use HTTPS in production`);
  }
  return url;
}

export type McpRuntimeConfig = {
  publicUrl: URL;
  issuer: URL;
  allowedHosts: string[];
  allowedOrigins: string[];
  allowedClientIds: string[];
  allowedRedirectUris: string[];
};

export function getMcpRuntimeConfig(request?: Request): McpRuntimeConfig {
  if (request && process.env.NODE_ENV === "production") {
    const requestIsHttps = new URL(request.url).protocol === "https:";
    const trustedProxyHttps =
      process.env.TRUSTED_PROXY_HEADERS === "true" &&
      request.headers
        .get("x-forwarded-proto")
        ?.split(",", 1)[0]
        ?.trim()
        .toLowerCase() === "https";
    if (!requestIsHttps && !trustedProxyHttps) {
      throw new Error("MCP and OAuth endpoints require HTTPS in production");
    }
  }
  const configuredPublicUrl = process.env.MCP_PUBLIC_URL?.trim();
  if (!configuredPublicUrl && process.env.NODE_ENV === "production") {
    throw new Error("MCP_PUBLIC_URL is required in production");
  }
  const publicUrl = canonicalUrl(
    configuredPublicUrl ??
      `${request ? new URL(request.url).origin : "http://localhost:3000"}/mcp`,
    "MCP_PUBLIC_URL",
  );
  if (publicUrl.pathname !== "/mcp") {
    throw new Error("MCP_PUBLIC_URL must use the /mcp path");
  }

  const configuredIssuer = process.env.MCP_OAUTH_ISSUER?.trim();
  const issuer = canonicalUrl(
    configuredIssuer ?? publicUrl.origin,
    "MCP_OAUTH_ISSUER",
  );
  if (issuer.pathname !== "/" || issuer.search || issuer.hash) {
    throw new Error("MCP_OAUTH_ISSUER must be an origin without a path");
  }

  const extraHosts = csv(process.env.MCP_ALLOWED_HOSTS).map((value) => {
    if (value.includes(":") || value.includes("/")) {
      throw new Error("MCP_ALLOWED_HOSTS entries must be hostnames only");
    }
    return value.toLowerCase();
  });

  const configuredOrigins = csv(process.env.MCP_ALLOWED_ORIGINS).map(
    (value) => canonicalUrl(value, "MCP_ALLOWED_ORIGINS entry").origin,
  );

  return {
    publicUrl,
    issuer,
    allowedHosts: [...new Set([publicUrl.hostname.toLowerCase(), ...extraHosts])],
    allowedOrigins: [
      ...new Set(
        configuredOrigins.length > 0
          ? configuredOrigins
          : process.env.NODE_ENV === "production"
            ? [publicUrl.origin]
            : [publicUrl.origin, "http://localhost:3000"],
      ),
    ],
    allowedClientIds: [
      ...new Set([
        CHATGPT_CIMD_CLIENT_ID,
        ...csv(process.env.MCP_OAUTH_ALLOWED_CLIENT_IDS),
      ]),
    ],
    allowedRedirectUris: [
      ...new Set([
        CHATGPT_STABLE_REDIRECT_URI,
        ...csv(process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS),
      ]),
    ],
  };
}

export function getMcpOAuthSecret(): Uint8Array {
  const value =
    process.env.MCP_OAUTH_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production"
      ? process.env.AUTH_SECRET?.trim()
      : undefined);
  if (!value || new TextEncoder().encode(value).byteLength < 32) {
    throw new Error(
      "MCP_OAUTH_SECRET must contain at least 32 bytes (development may fall back to AUTH_SECRET)",
    );
  }
  return new TextEncoder().encode(value);
}

export function validateRequestOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return Response.json(
      { code: "MCP_ORIGIN_NOT_ALLOWED", message: "Request origin is invalid." },
      { status: 403 },
    );
  }
  if (!allowedOrigins.includes(normalized)) {
    return Response.json(
      {
        code: "MCP_ORIGIN_NOT_ALLOWED",
        message: "Request origin is not allowed.",
      },
      { status: 403 },
    );
  }
  return null;
}
