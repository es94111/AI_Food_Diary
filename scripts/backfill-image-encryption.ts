/**
 * Encrypts every pre-existing image object in object storage in place.
 *
 * New uploads are encrypted automatically (see src/lib/storage.ts). This script
 * migrates images stored before that feature existed: it reads each storage key
 * referenced by a SavedFood or Meal, and re-writes plaintext objects as
 * AES-256-GCM envelopes under the active encryption key.
 *
 * Usage:  npm run encryption:images
 *
 * Safe to re-run: objects already encrypted are skipped. Data-URL "keys" (very
 * old inline images) live in the DB, not storage, and are ignored. Run a storage
 * backup first — this rewrites objects in place.
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { encryptExistingImage, isStorageKey } from "../src/lib/storage";

async function collectKeys(): Promise<string[]> {
  const keys = new Set<string>();

  const foods = await prisma.savedFood.findMany({
    where: { imageStorageKey: { not: null } },
    select: { imageStorageKey: true }
  });
  for (const f of foods) if (f.imageStorageKey) keys.add(f.imageStorageKey);

  const meals = await prisma.meal.findMany({
    select: { imageStorageKey: true, imageStorageKeys: true }
  });
  for (const m of meals) {
    if (m.imageStorageKey) keys.add(m.imageStorageKey);
    for (const k of m.imageStorageKeys) keys.add(k);
  }

  // Only object-storage keys; skip legacy inline data-URL values.
  return [...keys].filter(isStorageKey);
}

async function main() {
  const keys = await collectKeys();
  console.log(`Found ${keys.length} unique image object(s) to check...`);

  let encrypted = 0;
  let already = 0;
  let missing = 0;
  for (const key of keys) {
    const result = await encryptExistingImage(key).catch((err) => {
      console.error(`  failed: ${key}`, err);
      return "missing" as const;
    });
    if (result === "encrypted") encrypted += 1;
    else if (result === "already") already += 1;
    else missing += 1;
  }

  console.log(`Done. ${encrypted} encrypted, ${already} already encrypted, ${missing} missing/failed.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Image encryption backfill failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
