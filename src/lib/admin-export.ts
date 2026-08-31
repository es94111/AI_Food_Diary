import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { activeEncryptionKeyId, encryptJson } from "@/lib/encryption";
import { decryptField } from "@/lib/field-crypto";

// Admin data export/import: the whole database (minus images and device tokens)
// as a decrypted JSON file, and the reverse import that re-encrypts every
// sensitive field under the CURRENT active key before writing.
//
// Plaintext discipline (both directions):
//  - Export decrypts every enc*/encrypted* column and strips the ciphertext; a
//    decryption failure falls back to the legacy plaintext column (decryptField
//    semantics) and is counted in the envelope — it never aborts the export.
//  - Import re-encrypts everything with the active key and ALWAYS nulls the
//    legacy plaintext columns, matching how the app writes new rows (see
//    b2-crypto.ts / profile-crypto.ts). The import never logs row values —
//    error strings are id-scoped only.
//  - Excluded entirely: User.passwordHash (export omits it; import regenerates
//    an unusable hash for inserted users), HealthConnection rows (tokenHash
//    cannot be rebuilt; devices just re-sync), Meal.aiRawEncrypted (derived AI
//    envelope — reconstructable from items/notes).
//  - NOTE: DailyRecommendation.advice is stored and exported in PLAINTEXT. It
//    holds AI-generated text and is the one remaining column not covered by the
//    B1/B2 encryption passes. This export/import round-trips it as-is and does
//    NOT change that; if an `encAdvice` column is ever added, update
//    toExportDailyRecommendation / dailyRecommendationWrite in lockstep.

export const EXPORT_FORMAT = "ai-food-diary-export";
export const EXPORT_VERSION = 1;

function isPayload(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "iv" in value &&
    "tag" in value &&
    "ciphertext" in value
  );
}

type Anomalies = Record<string, number>;

// Decrypt a Json? column via field-crypto, falling back to the legacy plaintext
// value (or null). A present-but-undecryptable payload counts an anomaly keyed
// by "Table.column" — the admin should fix the key ring before importing the
// export back, or those columns will be written as null.
function decCounted<T>(payload: unknown, fallback: T | null, anomalies: Anomalies, field: string): T | null {
  if (payload != null && isPayload(payload)) {
    try {
      return decryptField<T | null>(payload, fallback);
    } catch {
      anomalies[field] = (anomalies[field] ?? 0) + 1;
      return fallback;
    }
  }
  return fallback;
}

// Encrypted-Json write helper: encrypt when present, explicit SQL NULL
// otherwise (a bare `null` in a Prisma Json column means "leave unchanged",
// which would silently keep stale ciphertext on overwrite imports).
// Return type matches Prisma's Json column input (payload or explicit NULL).
function encOrNull(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value == null ? Prisma.JsonNull : encryptJson(value);
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Normalise the imageStorageKeys mirror invariant: rows from before multi-image
// existed only carry imageStorageKey. imageStorageKeys[0] mirrors it (see the
// comment on Meal.imageStorageKey in the schema).
function normalizeImageKeys(
  imageStorageKey: unknown,
  imageStorageKeys: unknown
): { imageStorageKey: string | null; imageStorageKeys: string[] } {
  const key = typeof imageStorageKey === "string" && imageStorageKey ? imageStorageKey : null;
  const keys = Array.isArray(imageStorageKeys) ? imageStorageKeys.filter((k): k is string => typeof k === "string" && !!k) : [];
  if (keys.length === 0 && key) return { imageStorageKey: key, imageStorageKeys: [key] };
  if (keys.length > 0 && !key) return { imageStorageKey: keys[0], imageStorageKeys: keys };
  return { imageStorageKey: key, imageStorageKeys: keys };
}

// Mirrors createUnusablePasswordHash in src/lib/auth.ts. Duplicated here (three
// lines) on purpose: auth.ts pulls in next/headers via server-only imports,
// which this module must avoid so tsx verification scripts can import it.
async function unusablePasswordHash(): Promise<string> {
  return argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export row types + import-side zod schemas. The write mappers build Prisma
// payloads by explicit whitelist, so unknown extra keys in an edited file are
// ignored, never written.
// ─────────────────────────────────────────────────────────────────────────────

const nullableStr = z.string().nullable().optional();
const nullableNum = z.number().nullable().optional();
const iso = z.string().datetime().optional();

export const userExportSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: nullableStr,
  googleId: nullableStr,
  isAdmin: z.boolean().default(false),
  tokenVersion: z.number().int().min(0).default(0),
  createdAt: iso,
  updatedAt: iso
});
export type ExportUser = z.infer<typeof userExportSchema>;

export const userProfileExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  gender: nullableStr,
  birthDate: nullableStr,
  heightCm: nullableNum,
  weightKg: nullableNum,
  activityLevel: nullableStr,
  goal: z.enum(["LOSE_FAT", "MAINTAIN", "BUILD_MUSCLE"]).nullable().optional(),
  calorieTarget: z.number().int().nullable().optional(),
  waterGoalMl: z.number().int().nullable().optional(),
  timezone: nullableStr,
  preferences: z.array(z.string()).nullable().optional(),
  allergies: z.array(z.string()).nullable().optional(),
  aiProvider: nullableStr,
  aiBaseUrl: nullableStr,
  aiVisionModel: nullableStr,
  aiTextModel: nullableStr,
  aiApiKey: nullableStr,
  createdAt: iso,
  updatedAt: iso
});
export type ExportUserProfile = z.infer<typeof userProfileExportSchema>;

export const mealExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  imageStorageKey: nullableStr,
  imageStorageKeys: z.array(z.string()).optional(),
  totalCalories: z.number(),
  totalProtein: z.number(),
  totalFat: z.number(),
  totalCarbs: z.number(),
  aiConfidence: nullableNum,
  aiNotes: nullableStr,
  eatenAt: iso,
  createdAt: iso,
  updatedAt: iso
});
export type ExportMeal = z.infer<typeof mealExportSchema>;

export const mealItemExportSchema = z.object({
  id: z.string().min(1),
  mealId: z.string().min(1),
  name: nullableStr,
  estimatedAmount: nullableStr,
  calories: z.number(),
  protein: z.number(),
  fat: z.number(),
  carbs: z.number(),
  aiRating: z.string().default("MANUAL"),
  createdAt: iso,
  updatedAt: iso
});
export type ExportMealItem = z.infer<typeof mealItemExportSchema>;

export const waterLogExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  amountMl: z.number().int().min(0),
  drankAt: iso,
  createdAt: iso,
  updatedAt: iso
});
export type ExportWaterLog = z.infer<typeof waterLogExportSchema>;

export const savedFoodExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  barcode: nullableStr,
  imageStorageKey: nullableStr,
  name: nullableStr,
  estimatedAmount: nullableStr,
  brand: nullableStr,
  calories: z.number(),
  protein: z.number(),
  fat: z.number(),
  carbs: z.number(),
  source: z.string().default("MANUAL"),
  isFavorite: z.boolean().default(false),
  useCount: z.number().int().default(0),
  lastUsedAt: iso,
  archivedAt: iso,
  createdAt: iso,
  updatedAt: iso
});
export type ExportSavedFood = z.infer<typeof savedFoodExportSchema>;

export const dailySummaryExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  summaryDate: z.string().datetime(),
  totalCalories: z.number(),
  totalProtein: z.number(),
  totalFat: z.number(),
  totalCarbs: z.number(),
  aiSummary: nullableStr,
  aiRecommendation: nullableStr,
  createdAt: iso,
  updatedAt: iso
});
export type ExportDailySummary = z.infer<typeof dailySummaryExportSchema>;

export const dailyRecommendationExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  recommendationDate: z.string().datetime(),
  advice: z.string().default(""),
  totalCalories: z.number(),
  totalProtein: z.number(),
  totalFat: z.number(),
  totalCarbs: z.number(),
  createdAt: iso,
  updatedAt: iso
});
export type ExportDailyRecommendation = z.infer<typeof dailyRecommendationExportSchema>;

export const healthMetricExportSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  source: z.string().default("HEALTH_CONNECT"),
  type: z.string(),
  value: nullableNum,
  unit: z.string().default(""),
  measuredAt: z.string().datetime(),
  // No 32 KB cap here (unlike the sync route): an export may contain larger raw
  // payloads and this is an admin-level restore, not a client upload.
  raw: z.unknown().nullable().optional(),
  createdAt: iso,
  updatedAt: iso
});
export type ExportHealthMetric = z.infer<typeof healthMetricExportSchema>;

export const appConfigExportSchema = z.object({
  id: z.string().min(1),
  registrationOpen: z.boolean().default(true),
  createdAt: iso,
  updatedAt: iso
});
export type ExportAppConfig = z.infer<typeof appConfigExportSchema>;

export const exportEnvelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string().datetime().optional(),
  keyId: z.string().optional(), // informational at export; ignored at import
  counts: z.record(z.string(), z.number().int()).optional(),
  decryptionAnomalies: z.record(z.string(), z.number().int()).optional(),
  data: z.object({
    users: z.array(userExportSchema).default([]),
    userProfiles: z.array(userProfileExportSchema).default([]),
    meals: z.array(mealExportSchema).default([]),
    mealItems: z.array(mealItemExportSchema).default([]),
    waterLogs: z.array(waterLogExportSchema).default([]),
    savedFoods: z.array(savedFoodExportSchema).default([]),
    dailySummaries: z.array(dailySummaryExportSchema).default([]),
    dailyRecommendations: z.array(dailyRecommendationExportSchema).default([]),
    healthMetrics: z.array(healthMetricExportSchema).default([]),
    appConfig: z.array(appConfigExportSchema).default([])
  })
});
export type ImportEnvelope = z.infer<typeof exportEnvelopeSchema>;

export const TABLE_KEYS = [
  "users",
  "userProfiles",
  "meals",
  "mealItems",
  "waterLogs",
  "savedFoods",
  "dailySummaries",
  "dailyRecommendations",
  "healthMetrics",
  "appConfig"
] as const;
export type TableKey = (typeof TABLE_KEYS)[number];

// Import order follows FK dependencies; children never precede parents.
export const IMPORT_ORDER = TABLE_KEYS;

// Raised before any row is written so a bad/truncated file costs nothing.
export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export mappers: Prisma row → plaintext JSON row (decrypt + strip ciphertext).
// Row values arrive as loose objects because Prisma's branded types (Decimal,
// JsonValue) aren't worth threading through these one-directional mappers.
// ─────────────────────────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>;

function isoOf(value: unknown): string | undefined {
  const d = toDate(value);
  return d ? d.toISOString() : undefined;
}

function isoOrNull(value: unknown): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toExportUser(row: DbRow): ExportUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    googleId: (row.googleId as string | null) ?? null,
    isAdmin: Boolean(row.isAdmin),
    tokenVersion: Number(row.tokenVersion ?? 0),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportUserProfile(row: DbRow, anomalies: Anomalies): ExportUserProfile {
  return {
    id: row.id as string,
    userId: row.userId as string,
    gender: decCounted<string | null>(row.encGender, (row.gender as string | null) ?? null, anomalies, "UserProfile.encGender"),
    birthDate: decCounted<string | null>(
      row.encBirthDate,
      row.birthDate ? (new Date(row.birthDate as string).toISOString().slice(0, 10) as string) : null,
      anomalies,
      "UserProfile.encBirthDate"
    ),
    heightCm: decCounted<number | null>(row.encHeightCm, (row.heightCm as number | null) ?? null, anomalies, "UserProfile.encHeightCm"),
    weightKg: decCounted<number | null>(row.encWeightKg, row.weightKg != null ? Number(row.weightKg) : null, anomalies, "UserProfile.encWeightKg"),
    activityLevel: (row.activityLevel as string | null) ?? null,
    goal: (row.goal as ExportUserProfile["goal"]) ?? null,
    calorieTarget: numOrNull(row.calorieTarget),
    waterGoalMl: numOrNull(row.waterGoalMl),
    timezone: (row.timezone as string | null) ?? null,
    preferences: decCounted<string[] | null>(row.encryptedPreferences, null, anomalies, "UserProfile.encryptedPreferences"),
    allergies: decCounted<string[] | null>(row.encryptedAllergies, null, anomalies, "UserProfile.encryptedAllergies"),
    aiProvider: (row.aiProvider as string | null) ?? null,
    aiBaseUrl: (row.aiBaseUrl as string | null) ?? null,
    aiVisionModel: (row.aiVisionModel as string | null) ?? null,
    aiTextModel: (row.aiTextModel as string | null) ?? null,
    // Sensitivity note: the export file therefore contains every user's AI key
    // in plaintext. The UI copy must tell the admin to store it safely.
    aiApiKey: decCounted<string | null>(row.encryptedAiApiKey, null, anomalies, "UserProfile.encryptedAiApiKey"),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportMeal(row: DbRow, anomalies: Anomalies): ExportMeal {
  const images = normalizeImageKeys(row.imageStorageKey, row.imageStorageKeys);
  return {
    id: row.id as string,
    userId: row.userId as string,
    mealType: row.mealType as ExportMeal["mealType"],
    imageStorageKey: images.imageStorageKey,
    imageStorageKeys: images.imageStorageKeys,
    totalCalories: Number(row.totalCalories ?? 0),
    totalProtein: Number(row.totalProtein ?? 0),
    totalFat: Number(row.totalFat ?? 0),
    totalCarbs: Number(row.totalCarbs ?? 0),
    aiConfidence: numOrNull(row.aiConfidence),
    aiNotes: decCounted<string | null>(row.encAiNotes, (row.aiNotes as string | null) ?? null, anomalies, "Meal.encAiNotes"),
    eatenAt: isoOf(row.eatenAt),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportMealItem(row: DbRow, anomalies: Anomalies): ExportMealItem {
  return {
    id: row.id as string,
    mealId: row.mealId as string,
    name: decCounted<string | null>(row.encName, (row.name as string | null) ?? null, anomalies, "MealItem.encName"),
    estimatedAmount: decCounted<string | null>(
      row.encEstimatedAmount,
      (row.estimatedAmount as string | null) ?? null,
      anomalies,
      "MealItem.encEstimatedAmount"
    ),
    calories: Number(row.calories ?? 0),
    protein: Number(row.protein ?? 0),
    fat: Number(row.fat ?? 0),
    carbs: Number(row.carbs ?? 0),
    aiRating: (row.aiRating as string | undefined) ?? "MANUAL",
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportWaterLog(row: DbRow): ExportWaterLog {
  return {
    id: row.id as string,
    userId: row.userId as string,
    amountMl: Number(row.amountMl ?? 0),
    drankAt: isoOf(row.drankAt),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportSavedFood(row: DbRow, anomalies: Anomalies): ExportSavedFood {
  return {
    id: row.id as string,
    userId: row.userId as string,
    barcode: (row.barcode as string | null) ?? null,
    // The food thumbnail is an S3 identifier, not encrypted content — keep it
    // (unlike the API response, which intentionally hides the storage key).
    imageStorageKey: (row.imageStorageKey as string | null) ?? null,
    name: decCounted<string | null>(row.encName, (row.name as string | null) ?? null, anomalies, "SavedFood.encName"),
    estimatedAmount: decCounted<string | null>(
      row.encEstimatedAmount,
      (row.estimatedAmount as string | null) ?? null,
      anomalies,
      "SavedFood.encEstimatedAmount"
    ),
    brand: decCounted<string | null>(row.encBrand, null, anomalies, "SavedFood.encBrand"),
    calories: Number(row.calories ?? 0),
    protein: Number(row.protein ?? 0),
    fat: Number(row.fat ?? 0),
    carbs: Number(row.carbs ?? 0),
    source: (row.source as string | undefined) ?? "MANUAL",
    isFavorite: Boolean(row.isFavorite),
    useCount: Number(row.useCount ?? 0),
    lastUsedAt: isoOrNull(row.lastUsedAt) ?? undefined,
    archivedAt: isoOrNull(row.archivedAt) ?? undefined,
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportDailySummary(row: DbRow, anomalies: Anomalies): ExportDailySummary {
  return {
    id: row.id as string,
    userId: row.userId as string,
    summaryDate: isoOf(row.summaryDate) ?? "",
    totalCalories: Number(row.totalCalories ?? 0),
    totalProtein: Number(row.totalProtein ?? 0),
    totalFat: Number(row.totalFat ?? 0),
    totalCarbs: Number(row.totalCarbs ?? 0),
    aiSummary: decCounted<string | null>(row.encAiSummary, (row.aiSummary as string | null) ?? null, anomalies, "DailySummary.encAiSummary"),
    aiRecommendation: decCounted<string | null>(
      row.encAiRecommendation,
      (row.aiRecommendation as string | null) ?? null,
      anomalies,
      "DailySummary.encAiRecommendation"
    ),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportDailyRecommendation(row: DbRow): ExportDailyRecommendation {
  return {
    id: row.id as string,
    userId: row.userId as string,
    recommendationDate: isoOf(row.recommendationDate) ?? "",
    advice: (row.advice as string | undefined) ?? "",
    totalCalories: Number(row.totalCalories ?? 0),
    totalProtein: Number(row.totalProtein ?? 0),
    totalFat: Number(row.totalFat ?? 0),
    totalCarbs: Number(row.totalCarbs ?? 0),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportHealthMetric(row: DbRow, anomalies: Anomalies): ExportHealthMetric {
  return {
    id: row.id as string,
    userId: row.userId as string,
    source: (row.source as string | undefined) ?? "HEALTH_CONNECT",
    type: (row.type as string | undefined) ?? "",
    value: decCounted<number | null>(row.encValue, (row.value as number | null) ?? null, anomalies, "HealthMetric.encValue"),
    unit: (row.unit as string | undefined) ?? "",
    measuredAt: isoOf(row.measuredAt) ?? "",
    raw: decCounted<unknown>(row.rawEncrypted, null, anomalies, "HealthMetric.rawEncrypted"),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

function toExportAppConfig(row: DbRow): ExportAppConfig {
  return {
    id: row.id as string,
    registrationOpen: Boolean(row.registrationOpen),
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt)
  };
}

// Builds the full decrypted export envelope. Never throws on individual
// decryption failures — they are counted. Never logs values.
export async function buildExportEnvelope(): Promise<{
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  keyId: string;
  counts: Record<string, number>;
  decryptionAnomalies: Record<string, number>;
  data: {
    users: ExportUser[];
    userProfiles: ExportUserProfile[];
    meals: ExportMeal[];
    mealItems: ExportMealItem[];
    waterLogs: ExportWaterLog[];
    savedFoods: ExportSavedFood[];
    dailySummaries: ExportDailySummary[];
    dailyRecommendations: ExportDailyRecommendation[];
    healthMetrics: ExportHealthMetric[];
    appConfig: ExportAppConfig[];
  };
}> {
  const anomalies: Anomalies = {};
  const [users, userProfiles, meals, mealItems, waterLogs, savedFoods, dailySummaries, dailyRecommendations, healthMetrics, appConfig] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.userProfile.findMany(),
      prisma.meal.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.mealItem.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.waterLog.findMany(),
      prisma.savedFood.findMany(),
      prisma.dailySummary.findMany(),
      prisma.dailyRecommendation.findMany(),
      prisma.healthMetric.findMany(),
      prisma.appConfig.findMany()
    ]);

  const data = {
    users: users.map((row) => toExportUser(row as DbRow)),
    userProfiles: userProfiles.map((row) => toExportUserProfile(row as DbRow, anomalies)),
    meals: meals.map((row) => toExportMeal(row as DbRow, anomalies)),
    mealItems: mealItems.map((row) => toExportMealItem(row as DbRow, anomalies)),
    waterLogs: waterLogs.map((row) => toExportWaterLog(row as DbRow)),
    savedFoods: savedFoods.map((row) => toExportSavedFood(row as DbRow, anomalies)),
    dailySummaries: dailySummaries.map((row) => toExportDailySummary(row as DbRow, anomalies)),
    dailyRecommendations: dailyRecommendations.map((row) => toExportDailyRecommendation(row as DbRow)),
    healthMetrics: healthMetrics.map((row) => toExportHealthMetric(row as DbRow, anomalies)),
    appConfig: appConfig.map((row) => toExportAppConfig(row as DbRow))
  };

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    keyId: activeEncryptionKeyId(),
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    decryptionAnomalies: anomalies,
    data
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Import: per-table transaction in FK order, upsert-or-skip semantics, never
// deletes rows, never logs values.
// ─────────────────────────────────────────────────────────────────────────────

export type ImportMode = "skip-existing" | "overwrite";

export type ImportReport = {
  ok: boolean;
  mode: ImportMode;
  startedAt: string;
  finishedAt: string;
  tables: Array<{
    table: TableKey | string;
    total: number;
    imported: number;
    skippedExisting: number;
    failed: number;
    // Id-scoped errors only — safe to display, never contains row values.
    errors: string[];
  }>;
};

export type ImportOptions = {
  mode: ImportMode;
  // Overridable for tests; the default mirrors auth.ts's createUnusablePasswordHash.
  unusablePasswordHash?: () => Promise<string>;
};

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // Prisma messages can embed constraint names but not row values; cap length.
  return message.replace(/\s+/g, " ").slice(0, 200);
}

// Writes one row inside the current table transaction. Returns "skip" when the
// row already exists (skip-existing mode). Throws on per-row failures — the
// caller catches, counts, and continues without aborting the transaction.
type RowWriter = (
  tx: Prisma.TransactionClient,
  row: never,
  opts: ImportOptions,
  ctx: { userIds: Set<string>; mealIds: Set<string> }
) => Promise<"skip" | void>;

const writers: Record<TableKey, RowWriter> = {
  users: async (tx, rawRow, opts, _ctx) => {
    const row = rawRow as unknown as ExportUser;
    const createdAt = toDate(row.createdAt);
    if (opts.mode === "skip-existing") {
      const existing = await tx.user.findUnique({ where: { email: row.email }, select: { id: true } });
      if (existing) return "skip";
      await tx.user.create({
        data: {
          id: row.id,
          email: row.email,
          name: row.name ?? null,
          googleId: row.googleId ?? null,
          // Insert carries the export's flags (full restore re-creates admins);
          // passwordHash is never exported so an unusable hash is regenerated.
          isAdmin: Boolean(row.isAdmin),
          tokenVersion: row.tokenVersion ?? 0,
          passwordHash: await (opts.unusablePasswordHash ?? unusablePasswordHash)(),
          ...(createdAt ? { createdAt } : {})
        }
      });
      return;
    }
    // Overwrite: update matches by email but deliberately never touches
    // isAdmin or tokenVersion — the import can never widen/revoke an existing
    // user's admin status or resurrect revoked JWTs.
    await tx.user.upsert({
      where: { email: row.email },
      create: {
        id: row.id,
        email: row.email,
        name: row.name ?? null,
        googleId: row.googleId ?? null,
        isAdmin: Boolean(row.isAdmin),
        tokenVersion: row.tokenVersion ?? 0,
        passwordHash: await (opts.unusablePasswordHash ?? unusablePasswordHash)(),
        ...(createdAt ? { createdAt } : {})
      },
      update: {
        name: row.name ?? null,
        googleId: row.googleId ?? null,
        updatedAt: new Date()
      }
    });
  },

  userProfiles: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportUserProfile;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    const createdAt = toDate(row.createdAt);
    const data = {
      activityLevel: row.activityLevel ?? null,
      goal: row.goal ?? "MAINTAIN",
      calorieTarget: row.calorieTarget ?? 2000,
      waterGoalMl: row.waterGoalMl ?? 2000,
      timezone: row.timezone ?? null,
      aiProvider: row.aiProvider ?? null,
      aiBaseUrl: row.aiBaseUrl ?? null,
      aiVisionModel: row.aiVisionModel ?? null,
      aiTextModel: row.aiTextModel ?? null,
      // Re-encrypt everything; the legacy plaintext columns are ALWAYS cleared
      // (export decrypted them, so re-import re-encrypts — same convention as
      // profile-crypto.ts encryptProfileWrite).
      encGender: encOrNull(row.gender),
      gender: null,
      encBirthDate: encOrNull(row.birthDate),
      birthDate: null,
      encHeightCm: encOrNull(row.heightCm),
      heightCm: null,
      encWeightKg: encOrNull(row.weightKg),
      weightKg: null,
      encryptedPreferences: encOrNull(row.preferences),
      encryptedAllergies: encOrNull(row.allergies),
      encryptedAiApiKey: encOrNull(row.aiApiKey),
      ...(createdAt ? { createdAt } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.userProfile.upsert({
        where: { userId: row.userId },
        create: { id: row.id, userId: row.userId, ...data },
        update: data
      });
      return;
    }
    const existing = await tx.userProfile.findUnique({ where: { userId: row.userId }, select: { id: true } });
    if (existing) return "skip";
    await tx.userProfile.create({ data: { id: row.id, userId: row.userId, ...data } });
  },

  meals: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportMeal;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    const images = normalizeImageKeys(row.imageStorageKey, row.imageStorageKeys);
    // aiRawEncrypted intentionally not restored (derived data — see module note).
    const data = {
      userId: row.userId,
      mealType: row.mealType,
      imageStorageKey: images.imageStorageKey,
      imageStorageKeys: images.imageStorageKeys,
      totalCalories: new Prisma.Decimal(row.totalCalories ?? 0),
      totalProtein: new Prisma.Decimal(row.totalProtein ?? 0),
      totalFat: new Prisma.Decimal(row.totalFat ?? 0),
      totalCarbs: new Prisma.Decimal(row.totalCarbs ?? 0),
      aiConfidence: row.aiConfidence != null ? new Prisma.Decimal(row.aiConfidence) : null,
      aiNotes: null,
      encAiNotes: row.aiNotes == null ? Prisma.JsonNull : encryptJson(row.aiNotes),
      eatenAt: toDate(row.eatenAt) ?? new Date(),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.meal.upsert({ where: { id: row.id }, create: data, update: data });
      return;
    }
    const existing = await tx.meal.findUnique({ where: { id: row.id }, select: { id: true } });
    if (existing) return "skip";
    await tx.meal.create({ data });
  },

  mealItems: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportMealItem;
    if (!ctx.mealIds.has(row.mealId)) {
      throw new Error(`mealId ${row.mealId} 找不到對應的餐點（孤兒列）`);
    }
    const data = {
      mealId: row.mealId,
      name: null,
      encName: row.name == null ? Prisma.JsonNull : encryptJson(row.name),
      estimatedAmount: null,
      encEstimatedAmount: row.estimatedAmount == null ? Prisma.JsonNull : encryptJson(row.estimatedAmount),
      calories: new Prisma.Decimal(row.calories ?? 0),
      protein: new Prisma.Decimal(row.protein ?? 0),
      fat: new Prisma.Decimal(row.fat ?? 0),
      carbs: new Prisma.Decimal(row.carbs ?? 0),
      aiRating: row.aiRating ?? "MANUAL",
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.mealItem.upsert({ where: { id: row.id }, create: data, update: data });
      return;
    }
    const existing = await tx.mealItem.findUnique({ where: { id: row.id }, select: { id: true } });
    if (existing) return "skip";
    await tx.mealItem.create({ data });
  },

  waterLogs: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportWaterLog;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    const data = {
      userId: row.userId,
      amountMl: row.amountMl,
      drankAt: toDate(row.drankAt) ?? new Date(),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.waterLog.upsert({ where: { id: row.id }, create: data, update: data });
      return;
    }
    const existing = await tx.waterLog.findUnique({ where: { id: row.id }, select: { id: true } });
    if (existing) return "skip";
    await tx.waterLog.create({ data });
  },

  savedFoods: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportSavedFood;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    // (userId, barcode) is unique for non-null barcodes. Upsert by id could
    // create a second row for the same barcode; precheck and fail this row
    // instead of overwriting or deleting a different-id duplicate. Prisma
    // cannot target a compound-nullable unique in a `where`, hence selectFirst.
    if (row.barcode) {
      const barcodeOwner = await tx.savedFood.findFirst({
        where: { userId: row.userId, barcode: row.barcode, id: { not: row.id } },
        select: { id: true }
      });
      if (barcodeOwner) {
        throw new Error(`條碼已屬於另一筆資料（userId=${row.userId}）`);
      }
    }
    const data = {
      userId: row.userId,
      barcode: row.barcode ?? null,
      imageStorageKey: row.imageStorageKey ?? null,
      name: null,
      encName: row.name == null ? Prisma.JsonNull : encryptJson(row.name),
      estimatedAmount: null,
      encEstimatedAmount: row.estimatedAmount == null ? Prisma.JsonNull : encryptJson(row.estimatedAmount),
      encBrand: encOrNull(row.brand),
      calories: new Prisma.Decimal(row.calories ?? 0),
      protein: new Prisma.Decimal(row.protein ?? 0),
      fat: new Prisma.Decimal(row.fat ?? 0),
      carbs: new Prisma.Decimal(row.carbs ?? 0),
      source: row.source ?? "MANUAL",
      isFavorite: Boolean(row.isFavorite),
      useCount: row.useCount ?? 0,
      lastUsedAt: toDate(row.lastUsedAt),
      archivedAt: toDate(row.archivedAt),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.savedFood.upsert({ where: { id: row.id }, create: data, update: data });
      return;
    }
    const existing = await tx.savedFood.findUnique({ where: { id: row.id }, select: { id: true } });
    if (existing) return "skip";
    await tx.savedFood.create({ data });
  },

  dailySummaries: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportDailySummary;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    const summaryDate = toDate(row.summaryDate);
    if (!summaryDate) throw new Error("summaryDate 缺少或格式不正確");
    const data = {
      userId: row.userId,
      summaryDate,
      totalCalories: new Prisma.Decimal(row.totalCalories ?? 0),
      totalProtein: new Prisma.Decimal(row.totalProtein ?? 0),
      totalFat: new Prisma.Decimal(row.totalFat ?? 0),
      totalCarbs: new Prisma.Decimal(row.totalCarbs ?? 0),
      aiSummary: null,
      encAiSummary: row.aiSummary == null ? Prisma.JsonNull : encryptJson(row.aiSummary),
      aiRecommendation: null,
      encAiRecommendation: row.aiRecommendation == null ? Prisma.JsonNull : encryptJson(row.aiRecommendation),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      // Compound unique: an edited file with a different id but the same
      // (userId, summaryDate) merges instead of crashing with P2002.
      await tx.dailySummary.upsert({
        where: { userId_summaryDate: { userId: row.userId, summaryDate } },
        create: data,
        update: data
      });
      return;
    }
    const existing = await tx.dailySummary.findFirst({ where: { userId: row.userId, summaryDate }, select: { id: true } });
    if (existing) return "skip";
    await tx.dailySummary.create({ data });
  },

  dailyRecommendations: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportDailyRecommendation;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    const recommendationDate = toDate(row.recommendationDate);
    if (!recommendationDate) throw new Error("recommendationDate 缺少或格式不正確");
    // NOTE: advice stays plaintext on write (the column itself is plaintext);
    // see the module-level NOTE — this feature does not change the encryption
    // schema.
    const data = {
      userId: row.userId,
      recommendationDate,
      advice: row.advice ?? "",
      totalCalories: new Prisma.Decimal(row.totalCalories ?? 0),
      totalProtein: new Prisma.Decimal(row.totalProtein ?? 0),
      totalFat: new Prisma.Decimal(row.totalFat ?? 0),
      totalCarbs: new Prisma.Decimal(row.totalCarbs ?? 0),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.dailyRecommendation.upsert({
        where: { userId_recommendationDate: { userId: row.userId, recommendationDate } },
        create: data,
        update: data
      });
      return;
    }
    const existing = await tx.dailyRecommendation.findFirst({
      where: { userId: row.userId, recommendationDate },
      select: { id: true }
    });
    if (existing) return "skip";
    await tx.dailyRecommendation.create({ data });
  },

  healthMetrics: async (tx, rawRow, opts, ctx) => {
    const row = rawRow as unknown as ExportHealthMetric;
    if (!ctx.userIds.has(row.userId)) {
      throw new Error(`userId ${row.userId} 找不到對應的使用者（孤兒列）`);
    }
    const measuredAt = toDate(row.measuredAt);
    if (!measuredAt) throw new Error("measuredAt 缺少或格式不正確");
    const source = row.source ?? "HEALTH_CONNECT";
    const data = {
      userId: row.userId,
      source,
      type: row.type,
      value: null,
      encValue: row.value == null ? Prisma.JsonNull : encryptJson(row.value),
      unit: row.unit ?? "",
      measuredAt,
      rawEncrypted: row.raw == null ? Prisma.JsonNull : encryptJson(row.raw),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt) as Date } : {}),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.healthMetric.upsert({
        where: {
          userId_source_type_measuredAt: { userId: row.userId, source, type: row.type, measuredAt }
        },
        create: data,
        update: data
      });
      return;
    }
    const existing = await tx.healthMetric.findFirst({
      where: { userId: row.userId, source, type: row.type, measuredAt },
      select: { id: true }
    });
    if (existing) return "skip";
    await tx.healthMetric.create({ data });
  },

  appConfig: async (tx, rawRow, opts, _ctx) => {
    const row = rawRow as unknown as ExportAppConfig;
    const data = {
      registrationOpen: Boolean(row.registrationOpen),
      updatedAt: new Date()
    };
    if (opts.mode === "overwrite") {
      await tx.appConfig.upsert({
        where: { id: row.id },
        create: { id: row.id, registrationOpen: Boolean(row.registrationOpen) },
        update: data
      });
      return;
    }
    const existing = await tx.appConfig.findUnique({ where: { id: row.id }, select: { id: true } });
    if (existing) return "skip";
    await tx.appConfig.create({ data: { id: row.id, registrationOpen: Boolean(row.registrationOpen) } });
  }
};

// Loads parent id sets once per table (file ids ∪ existing DB ids) so orphan
// checks don't need a query per row.
async function importContext(envelope: ImportEnvelope): Promise<{ userIds: Set<string>; mealIds: Set<string> }> {
  const [dbUsers, dbMeals] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.meal.findMany({ select: { id: true } })
  ]);
  const userIds = new Set<string>([...envelope.data.users.map((u) => u.id), ...dbUsers.map((u) => u.id)]);
  const mealIds = new Set<string>([...envelope.data.meals.map((m) => m.id), ...dbMeals.map((m) => m.id)]);
  return { userIds, mealIds };
}

export async function applyImport(raw: string, opts: ImportOptions): Promise<ImportReport> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ImportValidationError("檔案不是有效的 JSON。");
  }
  const envelope = exportEnvelopeSchema.parse(parsedJson); // ZodError → 400 via apiError

  // Envelope sanity check against declared counts (catches truncated uploads).
  // Mismatch aborts before anything is written.
  if (envelope.counts) {
    for (const [table, count] of Object.entries(envelope.counts)) {
      const actual = (envelope.data as unknown as Record<string, unknown[]>)[table]?.length;
      if (actual !== count) {
        throw new ImportValidationError(`檔案內容與 counts 欄位不符（${table}: 宣告 ${count}，實際 ${actual ?? 0}），檔案可能不完整。`);
      }
    }
  }

  const report: ImportReport = {
    ok: true,
    mode: opts.mode,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    tables: []
  };
  const ctx = await importContext(envelope);

  for (const table of IMPORT_ORDER) {
    const rows = (envelope.data as unknown as Record<TableKey, unknown[]>)[table] ?? [];
    const tableReport = { table, total: rows.length, imported: 0, skippedExisting: 0, failed: 0, errors: [] as string[] };

    // Per-table transaction: all rows of this table, or none. A mid-table
    // failure marks the rest failed and stops at the first failing table —
    // earlier tables stay committed; re-running the import (skip-existing)
    // fills the gap. Errors never interrupt the whole run unless the
    // transaction itself throws (connection loss etc.).
    try {
      await prisma.$transaction(
        async (tx) => {
          const seenIds = new Set<string>();
          for (const row of rows) {
            const id = (row as { id?: unknown })?.id;
            if (!requireId(id)) {
              tableReport.failed += 1;
              tableReport.errors.push(`${table}: 列缺少 id`);
              continue;
            }
            if (seenIds.has(id as string)) {
              tableReport.failed += 1;
              tableReport.errors.push(`${table} id=${id} 在檔案內重複`);
              continue;
            }
            seenIds.add(id as string);
            try {
              const result = await writers[table](tx, row as never, opts, ctx);
              if (result === "skip") tableReport.skippedExisting += 1;
              else tableReport.imported += 1;
            } catch (err) {
              tableReport.failed += 1;
              tableReport.errors.push(`${table} id=${id}: ${shortError(err)}`);
            }
          }
        },
        { timeout: 120_000, maxWait: 20_000 }
      );
    } catch (err) {
      report.ok = false;
      tableReport.failed = rows.length;
      tableReport.errors.push(`資料表 ${table} 匯入失敗，已回滾：${shortError(err)}`);
      report.tables.push(tableReport);
      // Stop at the first failing table; remaining tables are untouched.
      for (const remaining of IMPORT_ORDER.slice(IMPORT_ORDER.indexOf(table) + 1)) {
        const remainingRows = (envelope.data as unknown as Record<TableKey, unknown[]>)[remaining] ?? [];
        report.tables.push({
          table: remaining,
          total: remainingRows.length,
          imported: 0,
          skippedExisting: 0,
          failed: remainingRows.length,
          errors: ["未執行（前一個資料表匯入失敗）"]
        });
      }
      break;
    }
    report.tables.push(tableReport);
    if (tableReport.failed > 0) report.ok = false;
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

function requireId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}