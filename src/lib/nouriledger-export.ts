import "server-only";
import { createHash } from "node:crypto";
import { buildExportEnvelope } from "@/lib/admin-export";
import { prisma } from "@/lib/db";
import { getDecryptedImage, isStorageKey } from "@/lib/storage";

// Builds the package NouriLedger imports: the admin-export envelope restricted to ONE account (no AI key,
// provider id, admin flag or other users) plus that account's decrypted photos, as multipart form data.
// The part names match what NouriLedger's importer expects: `file` (JSON), `attachmentsManifest`, `file_N`.

/** NouriLedger rejects a single photo larger than this. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Headroom under NouriLedger's 256 MiB package limit. */
export const MAX_PACKAGE_BYTES = 240 * 1024 * 1024;

export class ExportTooLargeError extends Error {
  constructor() {
    super("export_too_large");
    this.name = "ExportTooLargeError";
  }
}

export type ImageReader = (key: string) => Promise<{ body: Buffer; contentType: string } | null>;

export interface PackageResult {
  form: FormData;
  warnings: string[];
  counts: Record<string, number>;
  imageCount: number;
  bytes: number;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif"
};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Rows from before object storage stored the photo itself as a data URL in the "key" column.
function parseDataUrl(value: string): { body: Buffer; contentType: string } | null {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const body = Buffer.from(match[2], "base64");
  return body.length ? { body, contentType: match[1].toLowerCase() } : null;
}

export async function buildNouriLedgerPackage(userId: string, readImage: ImageReader = getDecryptedImage): Promise<PackageResult> {
  const envelope = await buildExportEnvelope({ userId, excludeSecrets: true });
  const { meals, savedFoods } = envelope.data;

  const wanted = new Set<string>();
  for (const meal of meals) {
    for (const key of meal.imageStorageKeys ?? []) if (key) wanted.add(key);
    if (meal.imageStorageKey) wanted.add(meal.imageStorageKey);
  }
  for (const food of savedFoods) if (food.imageStorageKey) wanted.add(food.imageStorageKey);

  let bytes = Buffer.byteLength(JSON.stringify(envelope));
  let unreadable = 0;
  let oversized = 0;
  const rewrite = new Map<string, string | null>();
  const files = new Map<string, { body: Buffer; contentType: string }>();
  for (const key of wanted) {
    let image: { body: Buffer; contentType: string } | null = null;
    let manifestKey = key;
    if (isStorageKey(key)) {
      try { image = await readImage(key); } catch { image = null; }
    } else {
      image = parseDataUrl(key);
      // Do not repeat a multi-megabyte data URL as an object key; address it by its content hash instead.
      if (image) manifestKey = `legacy-data-url:${sha256(image.body)}`;
    }
    if (!image || image.body.length === 0) { rewrite.set(key, null); unreadable += 1; continue; }
    if (image.body.length > MAX_IMAGE_BYTES) { rewrite.set(key, null); oversized += 1; continue; }
    if (!files.has(manifestKey)) {
      bytes += image.body.length;
      if (bytes > MAX_PACKAGE_BYTES) throw new ExportTooLargeError();
      files.set(manifestKey, image);
    }
    rewrite.set(key, manifestKey);
  }

  // A meal that still names a photo with no bytes would make the whole import fail, so unreadable photos are
  // dropped from the JSON (and reported) instead of leaving a dangling key. The meal itself is still imported.
  for (const meal of meals) {
    const keys = [...(meal.imageStorageKeys ?? []), ...(meal.imageStorageKey ? [meal.imageStorageKey] : [])];
    const kept = [...new Set(keys.map((key) => rewrite.get(key)).filter((key): key is string => Boolean(key)))];
    meal.imageStorageKeys = kept;
    meal.imageStorageKey = kept[0] ?? null;
  }
  for (const food of savedFoods) food.imageStorageKey = food.imageStorageKey ? (rewrite.get(food.imageStorageKey) ?? null) : null;

  const form = new FormData();
  form.set("file", new File([JSON.stringify(envelope)], "ai-food-diary-export.json", { type: "application/json" }));
  const manifest: Array<Record<string, string>> = [];
  let index = 0;
  for (const [key, image] of files) {
    const field = `file_${index}`;
    const filename = `photo-${index}.${EXTENSIONS[image.contentType] ?? "bin"}`;
    form.set(field, new File([new Uint8Array(image.body)], filename, { type: image.contentType }));
    manifest.push({ objectKey: key, fileField: field, filename, mimeType: image.contentType, sha256: sha256(image.body) });
    index += 1;
  }
  form.set("attachmentsManifest", JSON.stringify(manifest));

  const warnings: string[] = [];
  if (unreadable) warnings.push(`${unreadable} 張照片在舊站已無法讀取，已略過（相關餐點仍會匯入）。`);
  if (oversized) warnings.push(`${oversized} 張照片超過 20 MB，已略過（相關餐點仍會匯入）。`);
  return { form, warnings, counts: envelope.counts, imageCount: files.size, bytes };
}

export interface UserSummary {
  sourceUserId: string;
  account: { email: string; name: string };
  counts: Record<string, number>;
}

/** Identity and record counts shown on NouriLedger's confirmation page. Cheap: counts plus the photo keys only. */
export async function summarizeUser(userId: string): Promise<UserSummary | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) return null;
  const [meals, mealItems, savedFoods, waterLogs, healthMetrics, dailySummaries, mealImages, foodImages] = await Promise.all([
    prisma.meal.count({ where: { userId } }),
    prisma.mealItem.count({ where: { meal: { userId } } }),
    prisma.savedFood.count({ where: { userId } }),
    prisma.waterLog.count({ where: { userId } }),
    prisma.healthMetric.count({ where: { userId } }),
    prisma.dailySummary.count({ where: { userId } }),
    prisma.meal.findMany({ where: { userId }, select: { imageStorageKey: true, imageStorageKeys: true } }),
    prisma.savedFood.findMany({ where: { userId, imageStorageKey: { not: null } }, select: { imageStorageKey: true } })
  ]);
  const keys = new Set<string>();
  for (const meal of mealImages) {
    if (meal.imageStorageKey) keys.add(meal.imageStorageKey);
    for (const key of meal.imageStorageKeys) keys.add(key);
  }
  for (const food of foodImages) if (food.imageStorageKey) keys.add(food.imageStorageKey);
  return {
    sourceUserId: user.id,
    account: { email: user.email, name: user.name ?? "" },
    counts: { meals, meal_items: mealItems, saved_foods: savedFoods, water_logs: waterLogs, health_metrics: healthMetrics, daily_summaries: dailySummaries, images: keys.size }
  };
}
