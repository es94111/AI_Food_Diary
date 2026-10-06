import { addDaysStr, dayStartUtc, weekRangeUtc, type TzSpec } from "./dates";

export type InsightPeriod = "week" | "month";

export type InsightDay = {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  mealCount: number;
};

export type InsightWeightPoint = { at: string; value: number };

export type InsightSnapshot = {
  period: InsightPeriod;
  startDate: string;
  endDateExclusive: string;
  targetCalories: number;
  days: InsightDay[];
  weightPoints: InsightWeightPoint[];
};

export type InsightMealRow = {
  eatenAt: Date;
  totalCalories: unknown;
  totalProtein: unknown;
  totalFat: unknown;
  totalCarbs: unknown;
};

export type InsightWeightRow = {
  measuredAt: Date;
  value: number | null;
};

export function getInsightsWindow(period: InsightPeriod, date: string, tz: TzSpec) {
  let startDate: string;
  let endDateExclusive: string;
  if (period === "week") {
    const range = weekRangeUtc(date, tz);
    startDate = range.startStr;
    endDateExclusive = addDaysStr(startDate, 7);
  } else {
    const [year, month] = date.split("-").map(Number);
    startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    endDateExclusive = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }

  const dates: string[] = [];
  for (let day = startDate; day < endDateExclusive; day = addDaysStr(day, 1)) {
    dates.push(day);
  }

  return {
    start: dayStartUtc(startDate, tz),
    end: dayStartUtc(endDateExclusive, tz),
    startDate,
    endDateExclusive,
    dates
  };
}

export function aggregateInsightDays(dates: string[], meals: InsightMealRow[], tz: TzSpec): InsightDay[] {
  const days = new Map<string, InsightDay>(dates.map((date) => [date, {
    date,
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    mealCount: 0
  }]));

  for (const meal of meals) {
    const day = days.get(dateKeyAt(meal.eatenAt, tz));
    if (!day) continue;
    day.calories += numericValue(meal.totalCalories);
    day.protein += numericValue(meal.totalProtein);
    day.fat += numericValue(meal.totalFat);
    day.carbs += numericValue(meal.totalCarbs);
    day.mealCount += 1;
  }

  return [...days.values()];
}

export function latestWeightPerDay(rows: InsightWeightRow[], tz: TzSpec): InsightWeightPoint[] {
  const latest = new Map<string, InsightWeightPoint>();
  for (const row of rows) {
    const value = row.value;
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    const date = dateKeyAt(row.measuredAt, tz);
    const current = latest.get(date);
    if (!current || Date.parse(row.measuredAt.toISOString()) > Date.parse(current.at)) {
      latest.set(date, { at: row.measuredAt.toISOString(), value });
    }
  }
  return [...latest.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function dateKeyAt(value: Date, tz: TzSpec) {
  if (tz.kind === "offset") {
    return new Date(value.getTime() + tz.minutes * 60_000).toISOString().slice(0, 10);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
  return `${part.year}-${part.month}-${part.day}`;
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
