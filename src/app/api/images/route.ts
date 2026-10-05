import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiRoute } from "@/lib/http";
import { parseThumbWidth, resizeImageBytes } from "@/lib/image-thumb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getDecryptedImage, ownsStorageKey, parseSignedImageQuery, verifyImageSignature } from "@/lib/storage";

// Streaming endpoint for photos held in the private bucket. A caller must be
// logged in AND present a valid, unexpired signed reference *for a key it owns*;
// the object is decrypted here and streamed back, so the bucket never becomes
// readable and the raw object is never exposed. Any failure answers with one
// uniform 404, so the endpoint cannot be used to probe which keys exist.
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();

  // Bucket traffic per user so signature guessing cannot fan out into storage GETs.
  const limited = await enforceRateLimit(`signed-image:${user.id}`, { limit: 300, windowSec: 600 });
  if (limited) return limited;

  const url = new URL(request.url);
  const ref = parseSignedImageQuery(url);
  if (!ref || !verifyImageSignature("user", ref) || !ownsStorageKey(ref.key, user.id)) {
    return NextResponse.json({ error: "找不到圖片" }, { status: 404, headers: NO_STORE });
  }

  const image = await getDecryptedImage(ref.key).catch(() => null);
  if (!image) return NextResponse.json({ error: "找不到圖片" }, { status: 404, headers: NO_STORE });

  // Optional on-the-fly thumbnail, same as the per-food image route. The width is
  // not part of the signature: it only bounds output size, and resizing is
  // skipped when the object can't be processed.
  const width = parseThumbWidth(url.searchParams.get("w"));
  if (width != null) {
    const thumb = await resizeImageBytes(image.body, image.contentType, width);
    if (thumb) {
      return new NextResponse(new Uint8Array(thumb.body), {
        headers: { "Content-Type": thumb.contentType, "Cache-Control": "private, max-age=3600" }
      });
    }
  }

  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      // Short-lived links must not outlive their signature in a client cache.
      "Cache-Control": "private, max-age=60"
    }
  });
});
