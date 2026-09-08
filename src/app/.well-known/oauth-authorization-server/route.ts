import {
  metadataOptionsResponse,
  oauthAuthorizationServerMetadataResponse,
} from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return oauthAuthorizationServerMetadataResponse(request);
}

export function OPTIONS(): Response {
  return metadataOptionsResponse();
}

