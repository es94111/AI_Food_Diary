import "server-only";
import sharp from "sharp";

// Server-side thumbnail generation for authenticated image endpoints. The
// mobile app shows saved-food photos at 40–56px, but the stored originals can
// be 1600px+ photos; downloading the full image for a tiny avatar is the main
// cause of slow image loading and scroll jank in the manual meal-entry form.
// These helpers resize on the fly so clients can request a small variant via
// `?w=` and cache it separately from the full image.

const MAX_THUMB_WIDTH = 1600;

/// Parses and validates the `?w=` query value. Returns null when absent or
/// invalid so callers can fall back to serving the original image.
export function parseThumbWidth(value: string | null): number | null {
  if (!value) return null;
  const width = Number(value);
  if (!Number.isInteger(width) || width < 16 || width > MAX_THUMB_WIDTH) {
    return null;
  }
  return width;
}

/// Resizes decrypted image bytes to a width-bounded thumbnail. Returns null
/// when the image can't be processed (unsupported/corrupt data) so the caller
/// can serve the original instead of failing the request.
export async function resizeImageBytes(
  body: Buffer,
  contentType: string,
  width: number
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const pipeline = sharp(body, { animated: false }).resize({
      width,
      withoutEnlargement: true
    });
    // Preserve PNG (transparency) for PNG inputs; everything else becomes a
    // compact JPEG so every client can decode the thumbnail.
    const outType = contentType === "image/png" ? "image/png" : "image/jpeg";
    if (outType === "image/png") pipeline.png();
    else pipeline.jpeg({ quality: 80 });
    const resized = await pipeline.toBuffer();
    return { body: resized, contentType: outType };
  } catch {
    return null;
  }
}
