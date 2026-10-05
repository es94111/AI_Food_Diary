import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getDecryptedImage, parseSignedImageQuery, verifyImageSignature } from "@/lib/storage";

// Capability endpoint used only for the URLs this service hands to an external
// AI provider. The provider fetches images from the public internet and sends no
// session cookie, so this route cannot require a login; instead the URL itself is
// the credential: an `ai`-scoped HMAC over the object key, valid for only a few
// minutes. Because the object body is an encryption envelope, decryption happens
// here — the provider receives the plaintext image, never the ciphertext, and the
// bucket stays private. All failures are one uniform 404 so the key space cannot
// be probed.
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const ref = parseSignedImageQuery(new URL(request.url));
  if (!ref || !verifyImageSignature("ai", ref)) {
    return NextResponse.json({ error: "找不到圖片" }, { status: 404, headers: NO_STORE });
  }

  // Providers may retry a fetch; bound it per object rather than per caller,
  // since every provider request arrives from a shared egress IP.
  const limited = await enforceRateLimit(`ai-image:${ref.key}`, { limit: 60, windowSec: 300 });
  if (limited) return limited;

  const image = await getDecryptedImage(ref.key).catch(() => null);
  if (!image) return NextResponse.json({ error: "找不到圖片" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, no-store"
    }
  });
}
