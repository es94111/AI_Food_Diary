import {
  metadataOptionsResponse,
  oauthProtectedResourceMetadataResponse,
} from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return oauthProtectedResourceMetadataResponse(request);
}

export function OPTIONS(): Response {
  return metadataOptionsResponse();
}

