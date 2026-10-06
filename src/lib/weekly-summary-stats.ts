// Aggregation for the weekly AI recap.
//
// Deliberately dependency-free (no DB, no AI, no `server-only`) so it can be
// unit tested and reasoned about in isolation: the DB-touching orchestration
// lives in @/lib/weekly-summary. Bucketing by local date reuses the shared
// insight helpers, so "which day/week does this belong to" is answered in the
// user's timezone rather than the server's.

import { addDaysStr, weekRangeUtc, type TzSpec } from "./dates";
import { aggregateInsightDays, type InsightDay, type InsightMealRow } from "./insights";

export const DAYS_IN_WEEK = 7;

export type WeeklyTotals = { calories: number; protein: number; fat: number; carbs: number };

export type WeeklyAverages = WeeklyTotals & { waterMl: number };

export type WeeklySummaryWindow = {
  startDate: string;
  endDate: string;
  endDateExclusive: string;
  daysInWeek: number;
  start: Date;
  end: Date;
  dates: string[];
};

export type WeeklySummaryAggregate = {
  window: WeeklySummaryWindow;
  totals: WeeklyTotals;
  averages: WeeklyAverages;
  daysLogged: number;
  waterTotalMl: number;
};

/**
 * The Mon–Sun window containing `weekDateStr`, expressed as UTC instants derived
 * from the user's zone. `weekDateStr` may be any day inside the target week.
 */
export function weekWindow(weekDateStr: string, tz: TzSpec): WeeklySummaryWindow {
  const range = weekRangeUtc(weekDateStr, tz);
  const startDate = range.startStr;
  const endDateExclusive = addDaysStr(startDate, DAYS_IN_WEEK);
  const dates = Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDaysStr(startDate, index));
  return {
    startDate,
    endDate: dates[DAYS_IN_WEEK - 1],
    endDateExclusive,
    daysInWeek: DAYS_IN_WEEK,
    start: range.start,
    end: range.end,
    dates
  };
}

/**
 * Roll the week's meals and water up into the totals/averages the prompt and the
 * stored row need.
 *
 * Per-day averages always divide by all 7 days, matching how the web week view
 * averages intake. A half-logged week therefore reads as a genuinely low week
 * instead of being renormalised over only the logged days.
 */
export function aggregateWeek(
  window: WeeklySummaryWindow,
  tz: TzSpec,
  meals: InsightMealRow[],
  waterAmountsMl: number[]
): WeeklySummaryAggregate {
  const days: InsightDay[] = aggregateInsightDays(window.dates, meals, tz);
  const totals = days.reduce<WeeklyTotals>(
    (acc, day) => ({
      calories: acc.calories + day.calories,
      protein: acc.protein + day.protein,
      fat: acc.fat + day.fat,
      carbs: acc.carbs + day.carbs
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
  const waterTotalMl = waterAmountsMl.reduce((sum, ml) => sum + (Number(ml) || 0), 0);
  return {
    window,
    totals,
    averages: {
      calories: totals.calories / DAYS_IN_WEEK,
      protein: totals.protein / DAYS_IN_WEEK,
      fat: totals.fat / DAYS_IN_WEEK,
      carbs: totals.carbs / DAYS_IN_WEEK,
      waterMl: waterTotalMl / DAYS_IN_WEEK
    },
    daysLogged: days.filter((day) => day.mealCount > 0).length,
    waterTotalMl
  };
}
