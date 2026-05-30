import { NextResponse } from "next/server";
import { generateDailySummary } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, isoDate, startOfLocalDay } from "@/lib/dates";
import { getHealthContext, getLatestSyncedWeightKg, getLatestSyncedHeightCm } from "@/lib/health-context";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { sumMeals } from "@/lib/totals";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const target = url.searchParams.get("date")
    ? new Date(`${url.searchParams.get("date")}T00:00:00`)
    : new Date();
  const summaryDate = startOfLocalDay(target);

  const existing = await prisma.dailySummary.findUnique({
    where: { userId_summaryDate: { userId: user.id, summaryDate } }
  });
  if (existing) return NextResponse.json({ summary: existing });

  // Peek mode: return the stored summary only, without spending AI quota to
  // generate one. Used by the web/app to auto-display an existing summary on load.
  if (url.searchParams.get("generate") !== "1") {
    return NextResponse.json({ summary: null });
  }

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: summaryDate, lt: addDays(summaryDate, 1) } }
  });
  const totals = sumMeals(meals);
  const healthContext = await getHealthContext(user.id, summaryDate);
  const syncedWeight = await getLatestSyncedWeightKg(user.id, summaryDate);
  const syncedHeight = await getLatestSyncedHeightCm(user.id, summaryDate);
  const effectiveProfile = user.profile
    ? { ...user.profile, weightKg: syncedWeight ?? user.profile.weightKg, heightCm: syncedHeight ?? user.profile.heightCm }
    : null;
  // Prefer the target derived from the (synced) TDEE so it auto-updates with
  // Health Connect data; fall back to the stored target only when TDEE is unknown.
  const calorieTarget = calorieTargetFromGoal(calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel), effectiveProfile?.goal) ?? effectiveProfile?.calorieTarget ?? 2000;
  const ai = await generateDailySummary({
    date: isoDate(summaryDate),
    calorieTarget,
    totals,
    healthContext
  });

  const summary = await prisma.dailySummary.create({
    data: {
      userId: user.id,
      summaryDate,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalFat: totals.fat,
      totalCarbs: totals.carbs,
      aiSummary: ai.summary,
      aiRecommendation: ai.recommendation
    }
  });

  return NextResponse.json({ summary });
}
