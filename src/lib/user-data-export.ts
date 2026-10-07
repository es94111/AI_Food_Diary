import "server-only";
import { buildExportEnvelope, MAX_IMPORT_BYTES, type ImportEnvelope } from "@/lib/admin-export";
import { getDecryptedImage } from "@/lib/storage";
import { ExportTooLargeError, MAX_PACKAGE_BYTES, prepareExportImages, type ImageReader } from "@/lib/export-images";

export interface UserDataExportResult {
  json: string;
  warnings: string[];
  bytes: number;
  exportedAt: string;
}

function countImageReferences(envelope: ImportEnvelope): Map<string, number> {
  const references = new Map<string, number>();
  const add = (key: string | null | undefined) => {
    if (key) references.set(key, (references.get(key) ?? 0) + 1);
  };
  for (const meal of envelope.data.meals) {
    for (const key of meal.imageStorageKeys ?? []) add(key);
    add(meal.imageStorageKey);
  }
  for (const food of envelope.data.savedFoods) add(food.imageStorageKey);
  for (const bundle of envelope.data.mealBundles) add(bundle.imageStorageKey);
  return references;
}

export async function buildUserDataExport(
  userId: string,
  readImage: ImageReader = getDecryptedImage
): Promise<UserDataExportResult> {
  const envelope = await buildExportEnvelope({ userId, excludeSecrets: true });
  const baseJson = JSON.stringify(envelope, null, 2);
  const baseBytes = Buffer.byteLength(baseJson);
  if (baseBytes > MAX_IMPORT_BYTES) throw new ExportTooLargeError();

  // Base64 expands image bytes by a third. Reserve a little room for data-URL metadata
  // while keeping the resulting JSON within the existing admin import size limit.
  const maxPackageBytes = Math.min(
    MAX_PACKAGE_BYTES,
    baseBytes + Math.floor((MAX_IMPORT_BYTES - baseBytes) * 0.74)
  );
  const { files, warnings } = await prepareExportImages(envelope, userId, readImage, maxPackageBytes, true);
  const dataUrls = new Map<string, string>();
  let projectedBytes = Buffer.byteLength(JSON.stringify(envelope, null, 2));
  const references = countImageReferences(envelope);
  for (const [key, image] of files) {
    const dataUrl = `data:${image.contentType};base64,${image.body.toString("base64")}`;
    dataUrls.set(key, dataUrl);
    projectedBytes += (Buffer.byteLength(dataUrl) - Buffer.byteLength(key)) * (references.get(key) ?? 0);
  }
  if (projectedBytes > MAX_IMPORT_BYTES) throw new ExportTooLargeError();

  const inline = (key: string | null | undefined) => key ? (dataUrls.get(key) ?? null) : null;
  for (const meal of envelope.data.meals) {
    const keys = (meal.imageStorageKeys ?? []).map(inline).filter((key): key is string => Boolean(key));
    meal.imageStorageKeys = keys;
    meal.imageStorageKey = keys[0] ?? null;
  }
  for (const food of envelope.data.savedFoods) food.imageStorageKey = inline(food.imageStorageKey);
  for (const bundle of envelope.data.mealBundles) bundle.imageStorageKey = inline(bundle.imageStorageKey);

  const json = JSON.stringify(envelope, null, 2);
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_IMPORT_BYTES) throw new ExportTooLargeError();
  return { json, warnings, bytes, exportedAt: envelope.exportedAt ?? new Date().toISOString() };
}
