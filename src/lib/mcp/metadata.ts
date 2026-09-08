import "server-only";

import { hostHeaderValidationResponse } from "@modelcontextprotocol/server";
import { getMcpRuntimeConfig } from "./config";
import { oauthServerMetadata, protectedResourceMetadata } from "./oauth";

const PUBLIC_METADATA_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
} as const;

export function oauthAuthorizationServerMetadataResponse(request: Request): Response {
  try {
    const config = getMcpRuntimeConfig(request);
    const hostRejected = hostHeaderValidationResponse(request, config.allowedHosts);
    if (hostRejected) return hostRejected;
    return Response.json(oauthServerMetadata(config), {
      headers: PUBLIC_METADATA_HEADERS,
    });
  } catch (error) {
    console.error("OAuth metadata configuration error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "temporarily_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export function oauthProtectedResourceMetadataResponse(request: Request): Response {
  try {
    const config = getMcpRuntimeConfig(request);
    const hostRejected = hostHeaderValidationResponse(request, config.allowedHosts);
    if (hostRejected) return hostRejected;
    return Response.json(protectedResourceMetadata(config), {
      headers: PUBLIC_METADATA_HEADERS,
    });
  } catch (error) {
    console.error("OAuth resource metadata configuration error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "temporarily_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export function metadataOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Max-Age": "3600",
    },
  });
}
