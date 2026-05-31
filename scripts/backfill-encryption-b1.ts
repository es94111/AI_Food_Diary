/**
 * One-off backfill for stage B1: encrypts existing plaintext UserProfile body
 * fields (gender, birthDate, heightCm, weightKg) and HealthMetric.value into
 * their enc* columns, then clears the plaintext columns.
 *
 * Usage:
 *   1. BACK UP THE DATABASE FIRST — this clears plaintext columns in place.
 *   2. Deploy the B1 code + `prisma db push` (adds the enc* columns).
 *   3. Run:  npm run encryption:backfill:b1
 *
 * Safe to re-run: rows whose enc* column already holds ciphertext are skipped.
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { encryptJson } from "../src/lib/encryption";
import { isEncryptedPayload } from "../src/lib/field-crypto";

async function backfillUserProfiles() {
  const rows = await prisma.userProfile.findMany({
    select: {
      id: true,
      gender: true,
      birthDate: true,
      heightCm: true,
      weightKg: true,
      encGender: true,
      encBirthDate: true,
      encHeightCm: true,
      encWeightKg: true
    }
  });
  let changed = 0;
  for (const row of rows) {
    const data: Record<string, unknown> = {};
    if (row.gender != null && !isEncryptedPayload(row.encGender)) {
      data.encGender = encryptJson(row.gender);
      data.gender = null;
    }
    if (row.birthDate != null && !isEncryptedPayload(row.encBirthDate)) {
      // Store as a YYYY-MM-DD string to match the API/UI contract.
      data.encBirthDate = encryptJson(row.birthDate.toISOString().slice(0, 10));
      data.birthDate = null;
    }
    if (row.heightCm != null && !isEncryptedPayload(row.encHeightCm)) {
      data.encHeightCm = encryptJson(row.heightCm);
      data.heightCm = null;
    }
    if (row.weightKg != null && !isEncryptedPayload(row.encWeightKg)) {
      data.encWeightKg = encryptJson(Number(row.weightKg));
      data.weightKg = null;
    }
    if (Object.keys(data).length > 0) {
      await prisma.userProfile.update({ where: { id: row.id }, data });
      changed += 1;
    }
  }
  return { table: "UserProfile", scanned: rows.length, changed };
}

async function backfillHealthMetrics() {
  const BATCH = 1000;
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  // Cursor-paginate to avoid loading the whole table into memory.
  for (;;) {
    const rows = await prisma.healthMetric.findMany({
      select: { id: true, value: true, encValue: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      if (row.value != null && !isEncryptedPayload(row.encValue)) {
        await prisma.healthMetric.update({
          where: { id: row.id },
          data: { encValue: encryptJson(row.value), value: null }
        });
        changed += 1;
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return { table: "HealthMetric", scanned, changed };
}

async function main() {
  console.log("Backfilling B1 encrypted fields (UserProfile, HealthMetric)...");
  const results = [await backfillUserProfiles(), await backfillHealthMetrics()];
  for (const r of results) {
    console.log(`  ${r.table}: ${r.changed} encrypted / ${r.scanned} scanned`);
  }
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
