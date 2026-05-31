/**
 * One-off backfill for stage B2: encrypts existing MealItem, SavedFood and
 * DailySummary text fields into their enc* columns, then clears plaintext.
 *
 * Usage:
 *   1. BACK UP THE DATABASE FIRST — this clears plaintext columns in place.
 *   2. Deploy the B2 code + `prisma db push` (adds the enc* columns).
 *   3. Run:  npm run encryption:backfill:b2
 *
 * Safe to re-run: rows whose enc* column already holds ciphertext are skipped.
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { encryptJson } from "../src/lib/encryption";
import { isEncryptedPayload } from "../src/lib/field-crypto";

const BATCH = 1000;

async function backfillMealItems() {
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.mealItem.findMany({
      select: {
        id: true,
        name: true,
        estimatedAmount: true,
        encName: true,
        encEstimatedAmount: true
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      const data: Record<string, unknown> = {};
      if (row.name != null && !isEncryptedPayload(row.encName)) {
        data.encName = encryptJson(row.name);
        data.name = null;
      }
      if (row.estimatedAmount != null && !isEncryptedPayload(row.encEstimatedAmount)) {
        data.encEstimatedAmount = encryptJson(row.estimatedAmount);
        data.estimatedAmount = null;
      }
      if (Object.keys(data).length > 0) {
        await prisma.mealItem.update({ where: { id: row.id }, data });
        changed += 1;
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return { table: "MealItem", scanned, changed };
}

async function backfillMeals() {
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.meal.findMany({
      select: {
        id: true,
        aiNotes: true,
        encAiNotes: true
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      if (row.aiNotes != null && !isEncryptedPayload(row.encAiNotes)) {
        await prisma.meal.update({
          where: { id: row.id },
          data: { encAiNotes: encryptJson(row.aiNotes), aiNotes: null }
        });
        changed += 1;
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return { table: "Meal", scanned, changed };
}

async function backfillSavedFoods() {
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.savedFood.findMany({
      select: {
        id: true,
        name: true,
        estimatedAmount: true,
        encName: true,
        encEstimatedAmount: true
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      const data: Record<string, unknown> = {};
      if (row.name != null && !isEncryptedPayload(row.encName)) {
        data.encName = encryptJson(row.name);
        data.name = null;
      }
      if (row.estimatedAmount != null && !isEncryptedPayload(row.encEstimatedAmount)) {
        data.encEstimatedAmount = encryptJson(row.estimatedAmount);
        data.estimatedAmount = null;
      }
      if (Object.keys(data).length > 0) {
        await prisma.savedFood.update({ where: { id: row.id }, data });
        changed += 1;
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return { table: "SavedFood", scanned, changed };
}

async function backfillDailySummaries() {
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.dailySummary.findMany({
      select: {
        id: true,
        aiSummary: true,
        aiRecommendation: true,
        encAiSummary: true,
        encAiRecommendation: true
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      const data: Record<string, unknown> = {};
      if (row.aiSummary != null && !isEncryptedPayload(row.encAiSummary)) {
        data.encAiSummary = encryptJson(row.aiSummary);
        data.aiSummary = null;
      }
      if (row.aiRecommendation != null && !isEncryptedPayload(row.encAiRecommendation)) {
        data.encAiRecommendation = encryptJson(row.aiRecommendation);
        data.aiRecommendation = null;
      }
      if (Object.keys(data).length > 0) {
        await prisma.dailySummary.update({ where: { id: row.id }, data });
        changed += 1;
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return { table: "DailySummary", scanned, changed };
}

async function main() {
  console.log("Backfilling B2 encrypted fields (Meal, MealItem, SavedFood, DailySummary)...");
  const results = [
    await backfillMeals(),
    await backfillMealItems(),
    await backfillSavedFoods(),
    await backfillDailySummaries()
  ];
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
