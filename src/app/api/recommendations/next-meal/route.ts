import { NextResponse } from "next/server";
import { generateNextMealAdvice } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, startOfLocalDay } from "@/lib/dates";
import { sumMeals } from "@/lib/totals";

export async function GET() {
  const user = await requireUser();
  const start = startOfLocalDay(new Date());
  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: addDays(start, 1) } }
  });
  const today = sumMeals(meals);
  const advice = await generateNextMealAdvice({
    today,
    calorieTarget: user.profile?.calorieTarget ?? 2000,
    goal: user.profile?.goal ?? "MAINTAIN"
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
