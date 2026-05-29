import { NextResponse } from "next/server";
import { generateNextMealAdvice } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, startOfLocalDay } from "@/lib/dates";
import { getHealthContext, getLatestSyncedWeightKg } from "@/lib/health-context";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { sumMeals } from "@/lib/totals";

export async function GET() {
  const user = await requireUser();
  const start = startOfLocalDay(new Date());
  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: addDays(start, 1) } }
  });
  const today = sumMeals(meals);
  const healthContext = await getHealthContext(user.id, start);
  const syncedWeight = await getLatestSyncedWeightKg(user.id, start);
  const effectiveProfile = user.profile ? { ...user.profile, weightKg: syncedWeight ?? user.profile.weightKg } : null;
  const calorieTarget = effectiveProfile?.calorieTarget ?? calorieTargetFromGoal(calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel), effectiveProfile?.goal) ?? 2000;
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
