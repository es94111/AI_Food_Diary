/**
 * Stage C migration runner for encrypted-at-rest fields.
 *
 * Modes:
 *   npm run encryption:migrate:status  -> counts plaintext/encrypted fields
 *   npm run encryption:migrate:verify  -> status + decryptability check
 *   npm run encryption:migrate:apply   -> encrypts legacy plaintext and clears it
 *
 * `apply` is destructive because it clears legacy plaintext columns. Run a DB
 * backup first, then set DB_BACKUP_CONFIRMED=yes for the apply command.
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { decryptJson, encryptJson } from "../src/lib/encryption";
import { isEncryptedPayload } from "../src/lib/field-crypto";

const BATCH = 1000;
const BACKUP_CONFIRMATION = "yes";

type Mode = "status" | "verify" | "apply";
type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

type FieldSpec = {
  plaintext: string;
  encrypted: string;
  transform?: (value: unknown) => unknown;
};

type ModelSpec = {
  table: string;
  delegate: Delegate;
  fields: FieldSpec[];
};

type FieldStats = {
  table: string;
  plaintext: string;
  encrypted: string;
  scanned: number;
  pending: number;
  encryptedCount: number;
  plaintextWithEncrypted: number;
  missing: number;
  malformed: number;
  unreadable: number;
  changed: number;
};

const specs: ModelSpec[] = [
  {
    table: "UserProfile",
    delegate: prisma.userProfile as unknown as Delegate,
    fields: [
      { plaintext: "gender", encrypted: "encGender" },
      {
        plaintext: "birthDate",
        encrypted: "encBirthDate",
        transform: (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value)
      },
      { plaintext: "heightCm", encrypted: "encHeightCm" },
      { plaintext: "weightKg", encrypted: "encWeightKg", transform: Number }
    ]
  },
  {
    table: "HealthMetric",
    delegate: prisma.healthMetric as unknown as Delegate,
    fields: [{ plaintext: "value", encrypted: "encValue" }]
  },
  {
    table: "Meal",
    delegate: prisma.meal as unknown as Delegate,
    fields: [{ plaintext: "aiNotes", encrypted: "encAiNotes" }]
  },
  {
    table: "MealItem",
    delegate: prisma.mealItem as unknown as Delegate,
    fields: [
      { plaintext: "name", encrypted: "encName" },
      { plaintext: "estimatedAmount", encrypted: "encEstimatedAmount" }
    ]
  },
  {
    table: "SavedFood",
    delegate: prisma.savedFood as unknown as Delegate,
    fields: [
      { plaintext: "name", encrypted: "encName" },
      { plaintext: "estimatedAmount", encrypted: "encEstimatedAmount" }
    ]
  },
  {
    table: "DailySummary",
    delegate: prisma.dailySummary as unknown as Delegate,
    fields: [
      { plaintext: "aiSummary", encrypted: "encAiSummary" },
      { plaintext: "aiRecommendation", encrypted: "encAiRecommendation" }
    ]
  }
];

function selectFor(fields: FieldSpec[]) {
  return fields.reduce<Record<string, true>>((select, field) => {
    select[field.plaintext] = true;
    select[field.encrypted] = true;
    return select;
  }, { id: true });
}

function emptyStats(table: string, field: FieldSpec): FieldStats {
  return {
    table,
    plaintext: field.plaintext,
    encrypted: field.encrypted,
    scanned: 0,
    pending: 0,
    encryptedCount: 0,
    plaintextWithEncrypted: 0,
    missing: 0,
    malformed: 0,
    unreadable: 0,
    changed: 0
  };
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined;
}

function verifyPayload(value: unknown) {
  if (!hasValue(value)) return { encrypted: false, malformed: false, unreadable: false };
  if (!isEncryptedPayload(value)) return { encrypted: false, malformed: true, unreadable: false };
  try {
    decryptJson(value);
    return { encrypted: true, malformed: false, unreadable: false };
  } catch {
    return { encrypted: true, malformed: false, unreadable: true };
  }
}

async function scanSpec(spec: ModelSpec, mode: Mode) {
  const statsByField = new Map(spec.fields.map((field) => [field.plaintext, emptyStats(spec.table, field)]));
  let cursor: string | undefined;

  for (;;) {
    const rows = await spec.delegate.findMany({
      select: selectFor(spec.fields),
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const data: Record<string, unknown> = {};

      for (const field of spec.fields) {
        const stats = statsByField.get(field.plaintext);
        if (!stats) throw new Error(`Missing stats for ${spec.table}.${field.plaintext}`);

        const plaintext = row[field.plaintext];
        const encrypted = row[field.encrypted];
        const plaintextPresent = hasValue(plaintext);
        const payloadState = mode === "status"
          ? {
              encrypted: isEncryptedPayload(encrypted),
              malformed: hasValue(encrypted) && !isEncryptedPayload(encrypted),
              unreadable: false
            }
          : verifyPayload(encrypted);

        stats.scanned += 1;
        if (payloadState.encrypted) stats.encryptedCount += 1;
        if (payloadState.malformed) stats.malformed += 1;
        if (payloadState.unreadable) stats.unreadable += 1;
        if (plaintextPresent && payloadState.encrypted) stats.plaintextWithEncrypted += 1;
        if (plaintextPresent && !payloadState.encrypted) stats.pending += 1;
        if (!plaintextPresent && !payloadState.encrypted && !payloadState.malformed) stats.missing += 1;

        if (mode === "apply" && plaintextPresent) {
          data[field.encrypted] = encryptJson(field.transform ? field.transform(plaintext) : plaintext);
          data[field.plaintext] = null;
          stats.changed += 1;
        }
      }

      if (mode === "apply" && Object.keys(data).length > 0) {
        await spec.delegate.update({ where: { id: row.id }, data });
      }
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return [...statsByField.values()];
}

function printStats(stats: FieldStats[]) {
  for (const stat of stats) {
    console.log(
      [
        `${stat.table}.${stat.plaintext}->${stat.encrypted}`,
        `scanned=${stat.scanned}`,
        `pending=${stat.pending}`,
        `encrypted=${stat.encryptedCount}`,
        `dual=${stat.plaintextWithEncrypted}`,
        `missing=${stat.missing}`,
        `malformed=${stat.malformed}`,
        `unreadable=${stat.unreadable}`,
        `changed=${stat.changed}`
      ].join(" ")
    );
  }
}

function parseMode(): Mode {
  const raw = process.argv[2] ?? "status";
  if (raw === "status" || raw === "verify" || raw === "apply") return raw;
  throw new Error(`Unknown mode "${raw}". Use status, verify, or apply.`);
}

async function main() {
  const mode = parseMode();
  if (mode === "apply" && process.env.DB_BACKUP_CONFIRMED !== BACKUP_CONFIRMATION) {
    throw new Error("Refusing to apply: run a DB backup first, then set DB_BACKUP_CONFIRMED=yes.");
  }

  console.log(`Encryption migration stage C: ${mode}`);
  const results = [];
  for (const spec of specs) {
    results.push(...(await scanSpec(spec, mode)));
  }
  printStats(results);

  const totals = results.reduce(
    (acc, stat) => ({
      pending: acc.pending + stat.pending,
      dual: acc.dual + stat.plaintextWithEncrypted,
      malformed: acc.malformed + stat.malformed,
      unreadable: acc.unreadable + stat.unreadable,
      changed: acc.changed + stat.changed
    }),
    { pending: 0, dual: 0, malformed: 0, unreadable: 0, changed: 0 }
  );
  console.log(
    `Totals: pending=${totals.pending} dual=${totals.dual} malformed=${totals.malformed} unreadable=${totals.unreadable} changed=${totals.changed}`
  );

  if (mode === "verify" && (totals.pending > 0 || totals.dual > 0 || totals.malformed > 0 || totals.unreadable > 0)) {
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
