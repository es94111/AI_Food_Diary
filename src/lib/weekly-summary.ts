import "server-only";

import type { UserProfile } from "@/generated/prisma/client";
import { generateWeeklySummary } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { decryptWeeklySummary, encryptDailySummaryWrite } from "@/lib/b2-crypto";
import { isPrismaErrorCode, prisma } from "@/lib/db";
import { decryptMetricValue } from "@/lib/field-crypto";
import { getHealthContext, getLatestSyncedHeightCm, getLatestSyncedWeightKg } from "@/lib/health-context";
import { latestWeightPerDay } from "@/lib/insights";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { decryptProfile } from "@/lib/profile-crypto";
import type { TzSpec } from "@/lib/dates";
import {
  aggregateWeek,
  type WeeklySummaryAggregate,
  type WeeklySummaryWindow,
  weekWindow
} from "@/lib/weekly-summary-stats";

// Same minimal user shape the daily summary needs (see daily-summary.ts): the id,
// the admin flag for the env-key fallback, and the full profile for AI settings
// and body metrics. Both the API route (requireUser) and the worker provide it.
export type WeeklySummaryUser = { id: string; isAdmin: boolean; profile: UserProfile | null };

export type WeeklySummaryStats = WeeklySummaryAggregate & {
  targetCalories: number;
  weightStartKg: number | null;
  weightEndKg: number | null;
  weightChangeKg: number | null;
};

/**
 * Collect everything the weekly prompt and stored row need for `user`'s week:
 * the meals/water/weight range queries plus the aggregate from
 * @/lib/weekly-summary-stats. All bounds come from the user's `TzSpec` (see
 * `weekWindow`), so "last week" is never decided by the server's UTC clock.
 */
export async function collectWeeklySummaryStats(
  user: WeeklySummaryUser,
  weekDateStr: string,
  tz: TzSpec
): Promise<WeeklySummaryStats> {
  const window: WeeklySummaryWindow = weekWindow(weekDateStr, tz);

  const [meals, waterLogs, weightRows, latestWeight, latestHeight] = await Promise.all([
    prisma.meal.findMany({
      where: { userId: user.id, eatenAt: { gte: window.start, lt: window.end } },
      orderBy: { eatenAt: "asc" },
      select: { eatenAt: true, totalCalories: true, totalProtein: true, totalFat: true, totalCarbs: true }
    }),
    prisma.waterLog.findMany({
      where: { userId: user.id, drankAt: { gte: window.start, lt: window.end } },
      select: { amountMl: true }
    }),
    prisma.healthMetric.findMany({
      where: { userId: user.id, type: "WEIGHT", measuredAt: { gte: window.start, lt: window.end } },
      orderBy: { measuredAt: "asc" },
      take: 500,
      select: { measuredAt: true, value: true, encValue: true }
    }),
    getLatestSyncedWeightKg(user.id, window.end),
    getLatestSyncedHeightCm(user.id, window.end)
  ]);

  const aggregate = aggregateWeek(
    window,
    tz,
    meals,
    waterLogs.map((log) => Number(log.amountMl) || 0)
  );

  // Prefer the latest health-synced weight/height (as the daily summary does) so
  // the calorie target reflects real measurements; fall back to the profile.
  const decProfile = decryptProfile(user.profile);
  const effectiveProfile = decProfile
    ? {
        ...decProfile,
        weightKg: latestWeight ?? decProfile.weightKg,
        heightCm: latestHeight ?? decProfile.heightCm
      }
    : null;
  const targetCalories =
    calorieTargetFromGoal(calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel), effectiveProfile?.goal) ??
    effectiveProfile?.calorieTarget ??
    2000;

  // A single reading is not a trend: report the start/end only when at least two
  // days have a reading, and the change only then, so the prompt never claims a
  // direction from one data point.
  const weightPoints = latestWeightPerDay(
    weightRows.map((row) => ({ measuredAt: row.measuredAt, value: decryptMetricValue(row) })),
    tz
  );
  const hasTrend = weightPoints.length >= 2;
  const weightStartKg = hasTrend ? weightPoints[0].value : null;
  const weightEndKg = hasTrend ? weightPoints[weightPoints.length - 1].value : null;
  const weightChangeKg =
    weightStartKg != null && weightEndKg != null ? weightEndKg - weightStartKg : null;

  return { ...aggregate, targetCalories, weightStartKg, weightEndKg, weightChangeKg };
}

/**
 * Generate and persist a user's weekly summary for the (Mon–Sun) week containing
 * `weekDateStr`, in the user's timezone.
 *
 * Returns the existing row if one is already stored (idempotent across worker
 * restarts and repeat on-demand calls), the newly-created row, or `null` when the
 * week has no meals — we skip so we neither spend AI quota nor surface an empty
 * recap. Throws `AiNotConfiguredError` when the user has no usable AI key, so
 * callers can surface an error (route) or skip the user (worker).
 *
 * Shared by the on-demand API route (`generate=1`) and the worker's scheduled
 * pre-computation, so both paths produce identical summaries.
 */
export async function generateAndStoreWeeklySummary(user: WeeklySummaryUser, weekDateStr: string, tz: TzSpec) {
  const window = weekWindow(weekDateStr, tz);
  const weekStart = window.start;

  const existing = await prisma.weeklySummary.findUnique({
    where: { userId_weekStart: { userId: user.id, weekStart } }
  });
  if (existing) return existing;

  const stats = await collectWeeklySummaryStats(user, weekDateStr, tz);
  // No meals that week → nothing worth summarising; skip (no AI spend, no card).
  if (stats.daysLogged === 0) return null;

  // Throws AiNotConfiguredError when the user has no key.
  const aiConfig = resolveUserAiConfig(user);

  const healthContext = await getHealthContext(user.id, window.start, window.end);
  const ai = await generateWeeklySummary(aiConfig, {
    weekStart: window.startDate,
    weekEnd: window.endDate,
    calorieTarget: stats.targetCalories,
    totals: stats.totals,
    averages: stats.averages,
    daysLogged: stats.daysLogged,
    daysInWeek: window.daysInWeek,
    waterTotalMl: stats.waterTotalMl,
    weightStartKg: stats.weightStartKg,
    weightEndKg: stats.weightEndKg,
    weightChangeKg: stats.weightChangeKg,
    healthContext
  });

  try {
    return await prisma.weeklySummary.create({
      data: {
        userId: user.id,
        weekStart,
        totalCalories: stats.totals.calories,
        totalProtein: stats.totals.protein,
        totalFat: stats.totals.fat,
        totalCarbs: stats.totals.carbs,
        waterTotalMl: stats.waterTotalMl,
        ...encryptDailySummaryWrite({
          aiSummary: ai.summary,
          aiRecommendation: ai.recommendation
        })
      }
    });
  } catch (error) {
    // A concurrent run (worker tick overlapping an on-demand request) inserted
    // the same (userId, weekStart) first — return that row instead of failing.
    if (!isPrismaErrorCode(error, "P2002")) throw error;
    const row = await prisma.weeklySummary.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart } }
    });
    if (row) return row;
    throw error;
  }
}

/** Stored (decrypted) weekly summary for a user's week, or null when absent. */
export async function findStoredWeeklySummary(userId: string, weekDateStr: string, tz: TzSpec) {
  const { start } = weekWindow(weekDateStr, tz);
  const row = await prisma.weeklySummary.findUnique({
    where: { userId_weekStart: { userId, weekStart: start } }
  });
  return row ? decryptWeeklySummary(row) : null;
}
