import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { uploadImage } from "@/lib/storage";
import { isBlockedHost } from "@/lib/url-guard";
import { McpApplicationError } from "./errors";
import { assertMcpInvocationActive, type McpInvocation } from "./repository";

// The MCP server itself fetches AI-supplied image URLs, which is a real SSRF
// surface: the "caller" is effectively whatever untrusted content an AI agent
// has been fed (prompt injection), not just the account owner. Every layer
// below is defense in depth, not redundancy:
//   1. https-only, literal hostname not in a private/reserved range.
//   2. the hostname's *resolved* address isn't private either (catches a
//      public-looking domain that points at 169.254.169.254, etc.) — (1) alone
//      only inspects the string in the URL, same limitation as url-guard.ts.
//   3. no redirects followed (a redirect could retarget an internal host).
//   4. response must declare a real image content-type and stay under the
//      size cap while streaming, with a fetch timeout bounded by the MCP
//      operation deadline.
//   5. uploadImage() re-validates the actual bytes (size + magic-number
//      signature) before ever touching storage.

const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_RESPONSE_BYTES = 6 * 1024 * 1024; // mirrors storage.ts MAX_IMAGE_BYTES
const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** Validates the literal URL. Exported for unit testing without network I/O. */
export function assertSafeImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpApplicationError("INVALID_INPUT", "Image URL is not a valid absolute URL.");
  }
  if (url.protocol !== "https:") {
    throw new McpApplicationError("INVALID_INPUT", "Image URL must use https://.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "Image URL must not point to an internal or reserved address.",
    );
  }
  return url;
}

// DNS-rebinding note: this resolves once, ahead of the fetch, and does not pin
// the later connection to the address checked here — a TTL=0 attacker could
// still rebind between the two. That gap matches the one already accepted in
// url-guard.ts; full protection would require pinning the socket to the
// resolved address, which isn't worth the complexity for this feature.
async function assertResolvesToPublicAddress(hostname: string): Promise<void> {
  const stripped = hostname.replace(/^\[|\]$/, "").replace(/\]$/, "");
  if (isIP(stripped)) return; // literal IP already checked by isBlockedHost
  let records: Array<{ address: string }>;
  try {
    records = await lookup(stripped, { all: true });
  } catch {
    throw new McpApplicationError("INVALID_INPUT", "Image URL host could not be resolved.");
  }
  if (records.length === 0 || records.some((record) => isBlockedHost(record.address))) {
    throw new McpApplicationError("INVALID_INPUT", "Image URL resolves to a blocked address.");
  }
}

async function fetchImageAsDataUrl(url: URL, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: "error",
        headers: { Accept: "image/jpeg,image/png,image/webp,image/gif,image/avif" },
      });
    } catch {
      throw new McpApplicationError(
        "INVALID_INPUT",
        "Could not fetch the image URL (unreachable, redirected, or timed out).",
      );
    }
    if (!response.ok || !response.body) {
      throw new McpApplicationError(
        "INVALID_INPUT",
        `Image URL returned an unexpected response (status ${response.status}).`,
      );
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new McpApplicationError("INVALID_INPUT", "Image URL did not return a supported image content type.");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_RESPONSE_BYTES) {
      throw new McpApplicationError("INVALID_INPUT", "Image exceeds the 6 MB size limit.");
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_IMAGE_RESPONSE_BYTES) {
          throw new McpApplicationError("INVALID_INPUT", "Image exceeds the 6 MB size limit.");
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error instanceof McpApplicationError) throw error;
      throw new McpApplicationError(
        "INVALID_INPUT",
        "The image download was interrupted (connection dropped or timed out).",
      );
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return `data:${contentType};base64,${Buffer.concat(chunks).toString("base64")}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches each URL, validates it as an image, and stores it via the same
 * encrypted object-storage pipeline as every other meal photo. Returns the
 * resulting storage keys in order. All-or-nothing: on any failure, storage
 * objects already uploaded in this call are cleaned up before rethrowing.
 */
export async function resolveMealImageUrls(
  invocation: McpInvocation,
  urls: readonly string[],
): Promise<string[]> {
  const uploadedKeys: string[] = [];
  try {
    for (const raw of urls) {
      const remaining = assertMcpInvocationActive(invocation);
      const url = assertSafeImageUrl(raw);
      await assertResolvesToPublicAddress(url.hostname);
      const timeout = Number.isFinite(remaining)
        ? Math.max(1_000, Math.min(IMAGE_FETCH_TIMEOUT_MS, remaining - 500))
        : IMAGE_FETCH_TIMEOUT_MS;
      const dataUrl = await fetchImageAsDataUrl(url, timeout);
      uploadedKeys.push(await uploadImage(dataUrl, invocation.userId));
    }
    return uploadedKeys;
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => deleteImageIfUnreferenced(key).catch(() => undefined)));
    throw error;
  }
}
