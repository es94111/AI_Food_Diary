import { NextResponse } from "next/server";
import { generateDailySummary } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayRangeUtc, normalizeDateStr, todayStr } from "@/lib/dates";
import { resolveRequestTz } from "@/lib/timezone";
import { getHealthContext, getLatestSyncedWeightKg, getLatestSyncedHeightCm } from "@/lib/health-context";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { sumMeals } from "@/lib/totals";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const { start, end } = dayRangeUtc(dateStr, tz);
  const summaryDate = start;

  const existing = await prisma.dailySummary.findUnique({
    where: { userId_summaryDate: { userId: user.id, summaryDate } }
  });
  if (existing) return NextResponse.json({ summary: existing });

  // Peek mode: return the stored summary only, without spending AI quota to
  // generate one. Used by the web/app to auto-display an existing summary on load.
  if (url.searchParams.get("generate") !== "1") {
    return NextResponse.json({ summary: null });
  }

  if (dateStr >= todayStr(tz)) {
    return NextResponse.json(
      { error: "今日總結需等今天結束後才能產生。" },
      { status: 400 }
    );
  }

  const meals = await prisma.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: start, lt: end } }
  });
  const totals = sumMeals(meals);
  const healthContext = await getHealthContext(user.id, start, end);
  const syncedWeight = await getLatestSyncedWeightKg(user.id, end);
  const syncedHeight = await getLatestSyncedHeightCm(user.id, end);
  const effectiveProfile = user.profile
    ? { ...user.profile, weightKg: syncedWeight ?? user.profile.weightKg, heightCm: syncedHeight ?? user.profile.heightCm }
    : null;
  // Prefer the target derived from the (synced) TDEE so it auto-updates with
  // Health Connect data; fall back to the stored target only when TDEE is unknown.
  const calorieTarget = calorieTargetFromGoal(calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel), effectiveProfile?.goal) ?? effectiveProfile?.calorieTarget ?? 2000;
  let aiConfig;
  try {
    aiConfig = resolveUserAiConfig(user);
  } catch {
    return NextResponse.json({ error: "尚未設定 AI 金鑰，請點右上角「使用者設定 → AI 設定」選擇服務商並輸入你的 API 金鑰。" }, { status: 400 });
  }
  const ai = await generateDailySummary(aiConfig, {
    date: dateStr,
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
