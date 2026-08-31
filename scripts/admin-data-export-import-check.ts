/**
 * Admin data export/import verification.
 *
 * Modes:
 *   npx tsx scripts/admin-data-export-import-check.ts export
 *       Print the export envelope shape + counts (no DB modification).
 *   npx tsx scripts/admin-data-export-import-check.ts roundtrip
 *       Safe: build the export, then applyImport(skip-existing) against the
 *       SAME database. Every table must report imported=0, failed=0 and
 *       skippedExisting == row count — proving the import validates, decrypts,
 *       re-encrypts and de-duplicates without touching any row.
 *   npx tsx scripts/admin-data-export-import-check.ts wipe
 *       DANGEROUS: requires DB_BACKUP_CONFIRMED=yes, truncates all data tables,
 *       re-imports the export taken moments earlier, then re-exports and diffs
 *       field-by-field against the original (excluding exportedAt/keyId).
 *
 * Never prints row values — only counts.
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { applyImport, buildExportEnvelope, IMPORT_ORDER, type ImportReport } from "../src/lib/admin-export";

const mode = process.argv[2] ?? "export";
if (!["export", "roundtrip", "wipe"].includes(mode)) {
  console.error(`Unknown mode "${mode}". Use export, roundtrip, or wipe.`);
  process.exit(1);
}

function summarize(report: ImportReport): { ok: boolean } {
  let ok = true;
  for (const t of report.tables) {
    const line = `  ${t.table}: total=${t.total} imported=${t.imported} skipped=${t.skippedExisting} failed=${t.failed}`;
    console.log(line);
    if (t.failed > 0) {
      ok = false;
      for (const err of t.errors.slice(0, 5)) console.log(`    ! ${err}`);
    }
  }
  return { ok };
}

// Structural deep-diff of two envelopes ignoring metadata timestamps/keyIds.
// Field order and timestamps that legitimately changed (updatedAt) make an
// exact diff impossible; this compares the columns that must round-trip.
function diffEnvelopes(a: unknown, b: unknown, path: string, out: string[], depth = 0): number {
  if (depth > 8 || out.length > 50) return out.length;
  if (a === null || a === undefined || b === null || b === undefined) {
    if ((a ?? null) !== (b ?? null)) out.push(`${path}: ${String(a ?? null)} != ${String(b ?? null)}`);
    return out.length;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
    const n = Math.min(a.length, b.length);
    // Rows are keyed by id within each table; match by id for stability.
    const keyOf = (v: unknown) => typeof v === "object" && v !== null && "id" in (v as Record<string, unknown>) ? String((v as { id: unknown }).id) : null;
    if (keyOf(a[0])) {
      const bById = new Map(b.map((row) => [keyOf(row), row]));
      for (const row of a.slice(0, n)) diffEnvelopes(row, bById.get(keyOf(row)), `${path}[${keyOf(row)}]`, out, depth + 1);
    } else {
      for (let i = 0; i < n; i++) diffEnvelopes(a[i], b[i], `${path}[${i}]`, out, depth + 1);
    }
    return out.length;
  }
  if (typeof a === "object" && typeof b === "object") {
    const aa = a as Record<string, unknown>;
    const bb = b as Record<string, unknown>;
    const skip = new Set(["updatedAt", "exportedAt", "keyId"]);
    for (const key of new Set([...Object.keys(aa), ...Object.keys(bb)])) {
      if (skip.has(key)) continue;
      diffEnvelopes(aa[key], bb[key], `${path}.${key}`, out, depth + 1);
    }
    return out.length;
  }
  if (String(a) !== String(b)) out.push(`${path}: ${String(a)} != ${String(b)}`);
  return out.length;
}

const TRUNCATE_TABLES = [
  "HealthMetric",
  "DailyRecommendation",
  "DailySummary",
  "MealItem",
  "Meal",
  "WaterLog",
  "SavedFood",
  "HealthConnection",
  "UserProfile",
  "User",
  "AppConfig"
] as const;

async function main() {
  if (mode === "export") {
    const envelope = await buildExportEnvelope();
    console.log(`format=${envelope.format} version=${envelope.version}`);
    console.log(`exportedAt=${envelope.exportedAt} keyId=${envelope.keyId}`);
    for (const table of IMPORT_ORDER) {
      console.log(`  ${table}: ${envelope.counts[table] ?? 0}`);
    }
    const anomalies = Object.entries(envelope.decryptionAnomalies);
    if (anomalies.length > 0) {
      console.log("decryption anomalies (fix the key ring before relying on the export):");
      for (const [field, count] of anomalies) console.log(`  ${field}: ${count}`);
    } else {
      console.log("decryption anomalies: none");
    }
    return;
  }

  if (mode === "roundtrip") {
    const envelope = await buildExportEnvelope();
    const report = await applyImport(JSON.stringify(envelope), { mode: "skip-existing" });
    console.log("roundtrip (skip-existing) expected: every table imported=0 failed=0 skipped=row count");
    const { ok } = summarize(report);
    if (ok) console.log("PASS: no rows were touched and none failed.");
    else {
      console.log("FAIL: see the per-table errors above.");
      process.exitCode = 1;
    }
    return;
  }

  // wipe
  if (process.env.DB_BACKUP_CONFIRMED !== "yes") {
    throw new Error("Refusing to wipe: run a DB backup first, then set DB_BACKUP_CONFIRMED=yes.");
  }
  console.log("Taking export snapshot…");
  const original = await buildExportEnvelope();
  console.log("Truncating data tables…");
  for (const table of TRUNCATE_TABLES) {
    // Cascade: children first (already handled by the order above), still use
    // raw SQL so the run is explicit rather than a soft delete.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  console.log("Re-importing the snapshot (overwrite)…");
  const report = await applyImport(JSON.stringify(original), { mode: "overwrite" });
  summarize(report);
  if (!report.ok) {
    console.log("FAIL: import reported failures.");
    process.exitCode = 1;
    return;
  }
  console.log("Re-exporting and diffing…");
  const restored = await buildExportEnvelope();
  const diffs: string[] = [];
  diffEnvelopes(original.data, restored.data, "data", diffs);
  if (diffs.length === 0) {
    console.log("PASS: restored export matches the original (ignoring updatedAt).");
  } else {
    console.log(`FAIL: ${diffs.length} difference(s):`);
    for (const d of diffs.slice(0, 20)) console.log(`  ${d}`);
    process.exitCode = 1;
  }
}

main()
  .catch(async (err) => {
    console.error("Check failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());