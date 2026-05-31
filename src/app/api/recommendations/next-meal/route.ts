import { NextResponse } from "next/server";
import { generateNextMealAdvice } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayRangeUtc, normalizeDateStr } from "@/lib/dates";
import { resolveRequestTz } from "@/lib/timezone";
import { getHealthContext, getLatestSyncedWeightKg, getLatestSyncedHeightCm } from "@/lib/health-context";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { sumMeals } from "@/lib/totals";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  // Key by the caller's local date and zone (clients live in other timezones
  // than the server), so "today" matches the user's day and we don't surface
  // yesterday's advice in their early morning hours.
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const { start, end } = dayRangeUtc(dateStr, tz);

  // Peek mode: return today's stored advice without regenerating (no AI spend).
  // Used by the app to re-display advice after a restart.
  if (url.searchParams.get("peek") === "1") {
    const existing = await prisma.dailyRecommendation.findUnique({
      where: { userId_recommendationDate: { userId: user.id, recommendationDate: start } }
    });
    return NextResponse.json({ advice: existing?.advice ?? "", today: null });
  }

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } }
  });
  const today = sumMeals(meals);
  const healthContext = await getHealthContext(user.id, start, end);
  const syncedWeight = await getLatestSyncedWeightKg(user.id, end);
  const syncedHeight = await getLatestSyncedHeightCm(user.id, end);
  const effectiveProfile = user.profile
    ? { ...user.profile, weightKg: syncedWeight ?? user.profile.weightKg, heightCm: syncedHeight ?? user.profile.heightCm }
    : null;
  // Prefer the target derived from the (synced) TDEE so it auto-updates.
  const calorieTarget = calorieTargetFromGoal(calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel), effectiveProfile?.goal) ?? effectiveProfile?.calorieTarget ?? 2000;
  const advice = await generateNextMealAdvice({
    today,
    calorieTarget,
    goal: effectiveProfile?.goal ?? "MAINTAIN",
    healthContext
  });
  await prisma.dailyRecommendation.upsert({
    where: { userId_recommendationDate: { userId: user.id, recommendationDate: start } },
    update: {
      advice,
      totalCalories: today.calories,
      totalProtein: today.protein,
      totalFat: today.fat,
      totalCarbs: today.carbs
    },
    create: {
      userId: user.id,
      recommendationDate: start,
      advice,
      totalCalories: today.calories,
      totalProtein: today.protein,
      totalFat: today.fat,
      totalCarbs: today.carbs
    }
  });

  return NextResponse.json({ advice, today });
}
