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

  return NextResponse.json({ advice, today });
}
