import "server-only";

import type { UserProfile } from "@/generated/prisma/client";
import { generateDailySummary } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { encryptDailySummaryWrite } from "@/lib/b2-crypto";
import { type TzSpec, dayRangeUtc } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getHealthContext, getLatestSyncedHeightCm, getLatestSyncedWeightKg } from "@/lib/health-context";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { decryptProfile } from "@/lib/profile-crypto";
import { sumMeals } from "@/lib/totals";

// The minimal user shape this needs: id, admin flag (for the env-key fallback in
// resolveUserAiConfig), and the full profile (AI settings + body metrics). Both
// the on-demand route (requireUser) and the worker (prisma select) provide this.
export type DailySummaryUser = { id: string; isAdmin: boolean; profile: UserProfile | null };

/**
 * Generate and persist a user's daily summary for `dateStr` in their timezone.
 *
 * Returns the existing row if one is already stored, the newly-created row, or
 * `null` when there's nothing to summarise (no meals that day — we skip to avoid
 * spending AI quota and to avoid an empty popup). Throws `AiNotConfiguredError`
 * (from `resolveUserAiConfig`) when the user has no usable AI key, so callers can
 * decide whether to surface an error (route) or skip the user (worker).
 *
 * Shared by the on-demand API route (`generate=1`) and the worker's scheduled
 * pre-computation so both paths produce identical summaries.
 */
export async function generateAndStoreDailySummary(user: DailySummaryUser, dateStr: string, tz: TzSpec) {
  const { start, end } = dayRangeUtc(dateStr, tz);
  const summaryDate = start;

  const existing = await prisma.dailySummary.findUnique({
    where: { userId_summaryDate: { userId: user.id, summaryDate } }
  });
  if (existing) return existing;

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } }
  });
  // No meals logged → nothing worth summarising; skip (no AI spend, no popup).
  if (meals.length === 0) return null;

  // Throws AiNotConfiguredError when the user has no key.
  const aiConfig = resolveUserAiConfig(user);

  const totals = sumMeals(meals);
  const healthContext = await getHealthContext(user.id, start, end);
  const syncedWeight = await getLatestSyncedWeightKg(user.id, end);
  const syncedHeight = await getLatestSyncedHeightCm(user.id, end);
  const decProfile = decryptProfile(user.profile);
  const effectiveProfile = decProfile
    ? { ...decProfile, weightKg: syncedWeight ?? decProfile.weightKg, heightCm: syncedHeight ?? decProfile.heightCm }
    : null;
  // Prefer the target derived from the (synced) TDEE so it auto-updates with
  // Health Connect data; fall back to the stored target only when TDEE is unknown.
  const calorieTarget =
    calorieTargetFromGoal(calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel), effectiveProfile?.goal) ??
    effectiveProfile?.calorieTarget ??
    2000;

  const ai = await generateDailySummary(aiConfig, {
    date: dateStr,
    calorieTarget,
    totals,
    healthContext
  });

  return prisma.dailySummary.create({
    data: {
      userId: user.id,
      summaryDate,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalFat: totals.fat,
      totalCarbs: totals.carbs,
      ...encryptDailySummaryWrite({
        aiSummary: ai.summary,
        aiRecommendation: ai.recommendation
      })
    }
  });
}
