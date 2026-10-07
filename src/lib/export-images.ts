import "server-only";
import { createHash } from "node:crypto";
import type { ImportEnvelope } from "@/lib/admin-export";
import { getDecryptedImage, isStorageKey, ownsStorageKey } from "@/lib/storage";

/** NouriLedger rejects a single photo larger than this. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Headroom under NouriLedger's 256 MiB package limit. */
export const MAX_PACKAGE_BYTES = 240 * 1024 * 1024;
/** Photos fetched at the same time (bounds the memory held in flight to a few images). */
export const READ_CONCURRENCY = 4;

export class ExportTooLargeError extends Error {
  constructor() {
    super("export_too_large");
    this.name = "ExportTooLargeError";
  }
}

export type ImageReader = (key: string) => Promise<{ body: Buffer; contentType: string } | null>;

export interface ExportImage {
  body: Buffer;
  contentType: string;
}

export interface PreparedExportImages {
  files: Map<string, ExportImage>;
  warnings: string[];
  bytes: number;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function parseDataUrl(value: string): ExportImage | null {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const body = Buffer.from(match[2], "base64");
  return body.length ? { body, contentType: match[1].toLowerCase() } : null;
}

/** Loads only this user's photos, removes missing or oversized references, and normalizes legacy inline image keys. */
export async function prepareExportImages(
  envelope: ImportEnvelope,
  userId: string,
  readImage: ImageReader = getDecryptedImage,
  maxPackageBytes = MAX_PACKAGE_BYTES,
  inlineImageBytesAlreadyIncluded = false
): Promise<PreparedExportImages> {
  const { meals, savedFoods, mealBundles } = envelope.data;
  const wanted = new Set<string>();
  for (const meal of meals) {
    for (const key of meal.imageStorageKeys ?? []) if (key) wanted.add(key);
    if (meal.imageStorageKey) wanted.add(meal.imageStorageKey);
  }
  for (const food of savedFoods) if (food.imageStorageKey) wanted.add(food.imageStorageKey);
  for (const bundle of mealBundles) if (bundle.imageStorageKey) wanted.add(bundle.imageStorageKey);

  let bytes = Buffer.byteLength(JSON.stringify(envelope));
  if (bytes > maxPackageBytes) throw new ExportTooLargeError();
  let unreadable = 0;
  let unowned = 0;
  let oversized = 0;
  const rewrite = new Map<string, string | null>();
  const files = new Map<string, ExportImage>();
  const loadImage = async (key: string) => {
    let image: ExportImage | null = null;
    let manifestKey = key;
    if (isStorageKey(key)) {
      if (!ownsStorageKey(key, userId)) return { key, manifestKey, image, unowned: true };
      try { image = await readImage(key); } catch { image = null; }
    } else {
      image = parseDataUrl(key);
      // Do not repeat a multi-megabyte data URL as an object key; address it by its content hash instead.
      if (image) manifestKey = `legacy-data-url:${sha256(image.body)}`;
    }
    return { key, manifestKey, image, unowned: false };
  };

  const keys = [...wanted];
  for (let start = 0; start < keys.length; start += READ_CONCURRENCY) {
    const loaded = await Promise.all(keys.slice(start, start + READ_CONCURRENCY).map(loadImage));
    for (const { key, manifestKey, image, unowned: isUnowned } of loaded) {
      if (isUnowned) { rewrite.set(key, null); unowned += 1; continue; }
      if (!image || image.body.length === 0) { rewrite.set(key, null); unreadable += 1; continue; }
      if (image.body.length > MAX_IMAGE_BYTES) { rewrite.set(key, null); oversized += 1; continue; }
      if (!files.has(manifestKey)) {
        if (!(inlineImageBytesAlreadyIncluded && key.startsWith("data:"))) bytes += image.body.length;
        if (bytes > maxPackageBytes) throw new ExportTooLargeError();
        files.set(manifestKey, image);
      }
      rewrite.set(key, manifestKey);
    }
  }

  for (const meal of meals) {
    const keys = [...(meal.imageStorageKeys ?? []), ...(meal.imageStorageKey ? [meal.imageStorageKey] : [])];
    const kept = [...new Set(keys.map((key) => rewrite.get(key)).filter((key): key is string => Boolean(key)))];
    meal.imageStorageKeys = kept;
    meal.imageStorageKey = kept[0] ?? null;
  }
  for (const food of savedFoods) food.imageStorageKey = food.imageStorageKey ? (rewrite.get(food.imageStorageKey) ?? null) : null;
  for (const bundle of mealBundles) bundle.imageStorageKey = bundle.imageStorageKey ? (rewrite.get(bundle.imageStorageKey) ?? null) : null;

  const warnings: string[] = [];
  if (unowned) warnings.push(`${unowned} 張照片不屬於此帳號，已略過（相關紀錄仍會匯入）。`);
  if (unreadable) warnings.push(`${unreadable} 張照片在舊站已無法讀取，已略過（相關紀錄仍會匯入）。`);
  if (oversized) warnings.push(`${oversized} 張照片超過 20 MB，已略過（相關紀錄仍會匯入）。`);
  return { files, warnings, bytes };
}
