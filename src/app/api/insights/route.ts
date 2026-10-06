import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptMetricValue } from "@/lib/field-crypto";
import { decryptProfile } from "@/lib/profile-crypto";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";
import { aggregateInsightDays, getInsightsWindow, latestWeightPerDay, type InsightPeriod } from "@/lib/insights";
import { normalizeDateStr } from "@/lib/dates";
import { resolveRequestTz } from "@/lib/timezone";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period") ?? "week";
  if (rawPeriod !== "week" && rawPeriod !== "month") {
    return NextResponse.json({ error: "區間必須是 week 或 month。" }, { status: 400 });
  }

  const period: InsightPeriod = rawPeriod;
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const date = normalizeDateStr(url.searchParams.get("date"), tz);
  const window = getInsightsWindow(period, date, tz);

  // One range query supplies all daily nutrition buckets; weight is fetched in
  // one bounded range query rather than one request/query per day.
  const [meals, weightRows, latestWeight, latestHeight] = await Promise.all([
    prisma.meal.findMany({
      where: { userId: user.id, eatenAt: { gte: window.start, lt: window.end } },
      orderBy: { eatenAt: "asc" },
      select: {
        eatenAt: true,
        totalCalories: true,
        totalProtein: true,
        totalFat: true,
        totalCarbs: true
      }
    }),
    prisma.healthMetric.findMany({
      where: { userId: user.id, type: "WEIGHT", measuredAt: { gte: window.start, lt: window.end } },
      orderBy: { measuredAt: "desc" },
      take: 500,
      select: { measuredAt: true, value: true, encValue: true }
    }),
    prisma.healthMetric.findFirst({
      where: { userId: user.id, type: "WEIGHT", unit: "kg" },
      orderBy: { measuredAt: "desc" },
      select: { value: true, encValue: true }
    }),
    prisma.healthMetric.findFirst({
      where: { userId: user.id, type: "HEIGHT", unit: "cm" },
      orderBy: { measuredAt: "desc" },
      select: { value: true, encValue: true }
    })
  ]);

  const profile = decryptProfile(user.profile);
  const syncedWeight = latestWeight ? decryptMetricValue(latestWeight) : null;
  const syncedHeight = latestHeight ? decryptMetricValue(latestHeight) : null;
  const effectiveProfile = profile
    ? {
        ...profile,
        weightKg: syncedWeight && syncedWeight > 0 ? syncedWeight : profile.weightKg,
        heightCm: syncedHeight && syncedHeight > 0 ? syncedHeight : profile.heightCm
      }
    : null;
  const targetCalories = calorieTargetFromGoal(
    calculateTdee(calculateBmr(effectiveProfile), effectiveProfile?.activityLevel),
    effectiveProfile?.goal
  ) ?? profile?.calorieTarget ?? 2000;

  return NextResponse.json({
    period,
    startDate: window.startDate,
    endDateExclusive: window.endDateExclusive,
    targetCalories,
    days: aggregateInsightDays(window.dates, meals, tz),
    weightPoints: latestWeightPerDay(
      weightRows.map((row) => ({ measuredAt: row.measuredAt, value: decryptMetricValue(row) })),
      tz
    )
  }, { headers: { "Cache-Control": "private, no-store" } });
});
