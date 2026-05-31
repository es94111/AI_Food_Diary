/**
 * Stage D database hardening for encrypted-at-rest fields.
 *
 * After Stage C verify passes, this adds PostgreSQL CHECK constraints that keep
 * legacy plaintext columns null. The columns remain in place for compatibility,
 * but the database rejects accidental plaintext reintroduction.
 *
 * Modes:
 *   npm run encryption:stage-d:status
 *   ENCRYPTION_STAGE_D_CONFIRMED=yes npm run encryption:stage-d:apply
 *   ENCRYPTION_STAGE_D_CONFIRMED=yes npm run encryption:stage-d:rollback
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";

const CONFIRMATION = "yes";

type Mode = "status" | "apply" | "rollback";
type LegacyColumn = {
  table: string;
  column: string;
  constraint: string;
};

const legacyColumns: LegacyColumn[] = [
  { table: "UserProfile", column: "gender", constraint: "chk_userprofile_gender_null_after_encryption" },
  { table: "UserProfile", column: "birthDate", constraint: "chk_userprofile_birthdate_null_after_encryption" },
  { table: "UserProfile", column: "heightCm", constraint: "chk_userprofile_heightcm_null_after_encryption" },
  { table: "UserProfile", column: "weightKg", constraint: "chk_userprofile_weightkg_null_after_encryption" },
  { table: "HealthMetric", column: "value", constraint: "chk_healthmetric_value_null_after_encryption" },
  { table: "Meal", column: "aiNotes", constraint: "chk_meal_ainotes_null_after_encryption" },
  { table: "MealItem", column: "name", constraint: "chk_mealitem_name_null_after_encryption" },
  { table: "MealItem", column: "estimatedAmount", constraint: "chk_mealitem_estimatedamount_null_after_encryption" },
  { table: "SavedFood", column: "name", constraint: "chk_savedfood_name_null_after_encryption" },
  { table: "SavedFood", column: "estimatedAmount", constraint: "chk_savedfood_estimatedamount_null_after_encryption" },
  { table: "DailySummary", column: "aiSummary", constraint: "chk_dailysummary_aisummary_null_after_encryption" },
  { table: "DailySummary", column: "aiRecommendation", constraint: "chk_dailysummary_airecommendation_null_after_encryption" }
];

function quoteIdent(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseMode(): Mode {
  const raw = process.argv[2] ?? "status";
  if (raw === "status" || raw === "apply" || raw === "rollback") return raw;
  throw new Error(`Unknown mode "${raw}". Use status, apply, or rollback.`);
}

async function plaintextCount(def: LegacyColumn) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*) AS count FROM ${quoteIdent(def.table)} WHERE ${quoteIdent(def.column)} IS NOT NULL`
  );
  return Number(rows[0]?.count ?? 0);
}

async function constraintState(def: LegacyColumn) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean; validated: boolean | null }>>(
    `
      SELECT true AS exists, c.convalidated AS validated
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relname = $1
        AND c.conname = $2
        AND n.nspname = current_schema()
      LIMIT 1
    `,
    def.table,
    def.constraint
  );
  return rows[0] ?? { exists: false, validated: null };
}

async function printStatus() {
  for (const def of legacyColumns) {
    const [count, state] = await Promise.all([plaintextCount(def), constraintState(def)]);
    console.log(
      `${def.table}.${def.column}: plaintext=${count} constraint=${state.exists ? "present" : "missing"} validated=${state.validated ?? false}`
    );
  }
}

async function applyConstraints() {
  for (const def of legacyColumns) {
    const count = await plaintextCount(def);
    if (count > 0) {
      throw new Error(`Refusing Stage D: ${def.table}.${def.column} still has ${count} plaintext value(s). Run Stage C first.`);
    }

    const state = await constraintState(def);
    if (!state.exists) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${quoteIdent(def.table)} ADD CONSTRAINT ${quoteIdent(def.constraint)} CHECK (${quoteIdent(def.column)} IS NULL) NOT VALID`
      );
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE ${quoteIdent(def.table)} VALIDATE CONSTRAINT ${quoteIdent(def.constraint)}`);
    console.log(`${def.table}.${def.column}: constraint ready`);
  }
}

async function rollbackConstraints() {
  for (const def of legacyColumns) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${quoteIdent(def.table)} DROP CONSTRAINT IF EXISTS ${quoteIdent(def.constraint)}`
    );
    console.log(`${def.table}.${def.column}: constraint removed`);
  }
}

async function main() {
  const mode = parseMode();
  console.log(`Encryption stage D: ${mode}`);

  if ((mode === "apply" || mode === "rollback") && process.env.ENCRYPTION_STAGE_D_CONFIRMED !== CONFIRMATION) {
    throw new Error(`Refusing ${mode}: set ENCRYPTION_STAGE_D_CONFIRMED=yes after Stage C verify passes.`);
  }

  if (mode === "status") await printStatus();
  if (mode === "apply") await applyConstraints();
  if (mode === "rollback") await rollbackConstraints();

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
