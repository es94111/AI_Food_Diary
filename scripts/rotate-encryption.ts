/**
 * Re-encrypts every stored ciphertext under the currently active key.
 *
 * Usage (after introducing a new active key):
 *   1. Add the new key to ENCRYPTION_KEYS and point ENCRYPTION_KEY_ACTIVE at it:
 *        ENCRYPTION_KEYS='{"k1":"<oldBase64>","k2":"<newBase64>"}'
 *        ENCRYPTION_KEY_ACTIVE=k2
 *      (Keep the old key in the ring so existing rows can still be decrypted.)
 *   2. Run:  npx tsx scripts/rotate-encryption.ts
 *   3. Once it reports 0 remaining on the old key, you may remove the old key.
 *
 * Safe to re-run: rows already on the active key are skipped. Run a DB backup
 * first — this rewrites encrypted columns in place.
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { activeEncryptionKeyId, needsReencryption, reencrypt } from "../src/lib/encryption";

type EncryptedPayload = { v?: string; iv: string; tag: string; ciphertext: string };

function isPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "iv" in value &&
    "tag" in value &&
    "ciphertext" in value
  );
}

// Re-encrypt one field if it holds an out-of-date payload. Returns the new
// payload to persist, or null when nothing needs to change.
function rotateField(value: unknown): EncryptedPayload | null {
  if (!isPayload(value)) return null;
  if (!needsReencryption(value)) return null;
  return reencrypt(value);
}

async function rotateUserProfiles() {
  const rows = await prisma.userProfile.findMany({
    select: {
      id: true,
      encryptedPreferences: true,
      encryptedAllergies: true,
      encryptedAiApiKey: true,
      encGender: true,
      encBirthDate: true,
      encHeightCm: true,
      encWeightKg: true
    }
  });
  let changed = 0;
  for (const row of rows) {
    const data: Record<string, EncryptedPayload> = {};
    const fields: Array<[keyof typeof row, unknown]> = [
      ["encryptedPreferences", row.encryptedPreferences],
      ["encryptedAllergies", row.encryptedAllergies],
      ["encryptedAiApiKey", row.encryptedAiApiKey],
      ["encGender", row.encGender],
      ["encBirthDate", row.encBirthDate],
      ["encHeightCm", row.encHeightCm],
      ["encWeightKg", row.encWeightKg]
    ];
    for (const [name, value] of fields) {
      const next = rotateField(value);
      if (next) data[name as string] = next;
    }
    if (Object.keys(data).length > 0) {
      await prisma.userProfile.update({ where: { id: row.id }, data });
      changed += 1;
    }
  }
  return { table: "UserProfile", scanned: rows.length, changed };
}

async function rotateMeals() {
  const rows = await prisma.meal.findMany({ select: { id: true, aiRawEncrypted: true } });
  let changed = 0;
  for (const row of rows) {
    const next = rotateField(row.aiRawEncrypted);
    if (next) {
      await prisma.meal.update({ where: { id: row.id }, data: { aiRawEncrypted: next } });
      changed += 1;
    }
  }
  return { table: "Meal", scanned: rows.length, changed };
}

async function rotateHealthMetrics() {
  const rows = await prisma.healthMetric.findMany({ select: { id: true, rawEncrypted: true, encValue: true } });
  let changed = 0;
  for (const row of rows) {
    const data: Record<string, EncryptedPayload> = {};
    const raw = rotateField(row.rawEncrypted);
    if (raw) data.rawEncrypted = raw;
    const value = rotateField(row.encValue);
    if (value) data.encValue = value;
    if (Object.keys(data).length > 0) {
      await prisma.healthMetric.update({ where: { id: row.id }, data });
      changed += 1;
    }
  }
  return { table: "HealthMetric", scanned: rows.length, changed };
}

async function main() {
  console.log(`Rotating all ciphertext onto active key "${activeEncryptionKeyId()}"...`);
  const results = [await rotateUserProfiles(), await rotateMeals(), await rotateHealthMetrics()];
  for (const r of results) {
    console.log(`  ${r.table}: ${r.changed} re-encrypted / ${r.scanned} scanned`);
  }
  const total = results.reduce((sum, r) => sum + r.changed, 0);
  console.log(`Done. ${total} row(s) re-encrypted.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Rotation failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
