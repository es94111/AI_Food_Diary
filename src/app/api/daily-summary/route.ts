import { NextResponse } from "next/server";
import { generateDailySummary } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, isoDate, startOfLocalDay } from "@/lib/dates";
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

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: summaryDate, lt: addDays(summaryDate, 1) } }
  });
  const totals = sumMeals(meals);
  const ai = await generateDailySummary({
    date: isoDate(summaryDate),
    calorieTarget: user.profile?.calorieTarget ?? 2000,
    totals
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
