import "server-only";
import { createHash } from "node:crypto";
import { buildExportEnvelope } from "@/lib/admin-export";
import { prisma } from "@/lib/db";
import { getDecryptedImage } from "@/lib/storage";
import { prepareExportImages } from "@/lib/export-images";
import type { ImageReader } from "@/lib/export-images";

export { ExportTooLargeError, MAX_IMAGE_BYTES, MAX_PACKAGE_BYTES, READ_CONCURRENCY } from "@/lib/export-images";
export type { ImageReader } from "@/lib/export-images";

// Builds the package NouriLedger imports: the admin-export envelope restricted to ONE account (no AI key,
// provider id, admin flag or other users) plus that account's decrypted photos, as multipart form data.
// The part names match what NouriLedger's importer expects: `file` (JSON), `attachmentsManifest`, `file_N`.

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

export async function buildNouriLedgerPackage(userId: string, readImage: ImageReader = getDecryptedImage): Promise<PackageResult> {
  const envelope = await buildExportEnvelope({ userId, excludeSecrets: true });
  const { files, warnings, bytes } = await prepareExportImages(envelope, userId, readImage);
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
  const [meals, mealItems, savedFoods, mealBundles, mealBundleItems, waterLogs, healthMetrics, dailySummaries, mealImages, foodImages, bundleImages] = await Promise.all([
    prisma.meal.count({ where: { userId } }),
    prisma.mealItem.count({ where: { meal: { userId } } }),
    prisma.savedFood.count({ where: { userId } }),
    prisma.mealBundle.count({ where: { userId } }),
    prisma.mealBundleItem.count({ where: { mealBundle: { userId } } }),
    prisma.waterLog.count({ where: { userId } }),
    prisma.healthMetric.count({ where: { userId } }),
    prisma.dailySummary.count({ where: { userId } }),
    prisma.meal.findMany({ where: { userId }, select: { imageStorageKey: true, imageStorageKeys: true } }),
    prisma.savedFood.findMany({ where: { userId, imageStorageKey: { not: null } }, select: { imageStorageKey: true } }),
    prisma.mealBundle.findMany({ where: { userId, imageStorageKey: { not: null } }, select: { imageStorageKey: true } })
  ]);
  const keys = new Set<string>();
  for (const meal of mealImages) {
    if (meal.imageStorageKey) keys.add(meal.imageStorageKey);
    for (const key of meal.imageStorageKeys) keys.add(key);
  }
  for (const food of foodImages) if (food.imageStorageKey) keys.add(food.imageStorageKey);
  for (const bundle of bundleImages) if (bundle.imageStorageKey) keys.add(bundle.imageStorageKey);
  return {
    sourceUserId: user.id,
    account: { email: user.email, name: user.name ?? "" },
    counts: { meals, meal_items: mealItems, saved_foods: savedFoods, meal_bundles: mealBundles, meal_bundle_items: mealBundleItems, water_logs: waterLogs, health_metrics: healthMetrics, daily_summaries: dailySummaries, images: keys.size }
  };
}
