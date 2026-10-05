import "server-only";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { getDecryptedImage, signedImageAbsoluteUrl, uploadImage } from "@/lib/storage";

// AI providers accept an image either as an inline data URL or as a URL they
// fetch themselves. This resolves stored photos to short-lived signed URLs and
// only falls back to the inline read path for photos that cannot be linked
// (legacy inline data URLs, or a deployment with no publicly reachable origin).

let warnedMissingOrigin = false;

// A signed link is only usable by an external fetcher when this service is
// reachable under a stable public origin. `APP_PUBLIC_URL` is that origin (see
// /api/app/version, which derives app-update links the same way); without it we
// cannot hand out a URL the provider can actually fetch.
export function publicImageOrigin(): string | null {
  const configured = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  // Falling back means photos travel inline as base64 again. Surface it once so a
  // production deployment that forgot APP_PUBLIC_URL is not silently degraded.
  if (process.env.NODE_ENV === "production" && !warnedMissingOrigin) {
    warnedMissingOrigin = true;
    console.warn(
      "[vision-images] APP_PUBLIC_URL is not set — AI requests fall back to inline base64 images " +
        "instead of short-lived signed URLs. Set APP_PUBLIC_URL in production."
    );
  }
  return null;
}

export type VisionImageInput = { kind: "url" | "dataUrl"; value: string };

// Maps stored image keys (or legacy data URLs) to the payload the AI should see.
// Signed `ai`-scope URLs are preferred; the inline form is the backward-compatible
// path for pre-existing rows and for deployments without a public origin.
export async function resolveVisionImageInputs(keys: readonly string[]): Promise<VisionImageInput[]> {
  const origin = publicImageOrigin();
  const inputs: VisionImageInput[] = [];

  for (const key of keys) {
    if (key.startsWith("data:")) {
      inputs.push({ kind: "dataUrl", value: key });
      continue;
    }
    if (origin) {
      inputs.push({ kind: "url", value: signedImageAbsoluteUrl(origin, "ai", key) });
      continue;
    }
    // No public origin: serve the AI from storage directly, decrypting in process.
    const image = await getDecryptedImage(key).catch(() => null);
    if (!image) throw new Error("IMAGE_UNREADABLE");
    inputs.push({ kind: "dataUrl", value: `data:${image.contentType};base64,${image.body.toString("base64")}` });
  }

  return inputs;
}

// Preview-analysis entry point. When a public origin exists the photos are
// written to the private bucket first so the AI can be handed short-lived signed
// links (`uploadedKeys` must then be released by the caller once the analysis is
// done). Without one the incoming data URLs are passed straight through and
// nothing is stored — no point paying for a storage round trip we cannot link to.
// All-or-nothing: a mid-batch upload failure cleans up what was already written.
export async function resolvePreviewVisionImages(
  dataUrls: readonly string[],
  userId: string
): Promise<{ inputs: VisionImageInput[]; uploadedKeys: string[] }> {
  if (!publicImageOrigin()) {
    return { inputs: dataUrls.map((value) => ({ kind: "dataUrl", value })), uploadedKeys: [] };
  }
  const uploadedKeys: string[] = [];
  try {
    for (const dataUrl of dataUrls) uploadedKeys.push(await uploadImage(dataUrl, userId));
    return { inputs: await resolveVisionImageInputs(uploadedKeys), uploadedKeys };
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => deleteImageIfUnreferenced(key).catch(() => undefined)));
    throw error;
  }
}
