import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateInsightDays, getInsightsWindow, latestWeightPerDay } from "../../src/lib/insights";

test("weekly insight windows use Monday through Sunday in the requested timezone", () => {
  const window = getInsightsWindow("week", "2026-10-06", { kind: "offset", minutes: 480 });
  assert.equal(window.startDate, "2026-10-05");
  assert.equal(window.endDateExclusive, "2026-10-12");
  assert.equal(window.dates.length, 7);
  assert.equal(window.start.toISOString(), "2026-10-04T16:00:00.000Z");
});

test("monthly insight windows include every day of leap February", () => {
  const window = getInsightsWindow("month", "2024-02-13", { kind: "iana", tz: "Asia/Taipei" });
  assert.equal(window.startDate, "2024-02-01");
  assert.equal(window.endDateExclusive, "2024-03-01");
  assert.equal(window.dates.length, 29);
});

test("nutrition buckets use local dates, sum meals, and retain empty days", () => {
  const days = aggregateInsightDays(
    ["2026-10-05", "2026-10-06"],
    [
      { eatenAt: new Date("2026-10-05T17:00:00.000Z"), totalCalories: "420.5", totalProtein: "20", totalFat: "11", totalCarbs: "55" },
      { eatenAt: new Date("2026-10-05T18:00:00.000Z"), totalCalories: 300, totalProtein: 15, totalFat: 8, totalCarbs: 40 }
    ],
    { kind: "offset", minutes: 480 }
  );

  assert.deepEqual(days, [
    { date: "2026-10-05", calories: 0, protein: 0, fat: 0, carbs: 0, mealCount: 0 },
    { date: "2026-10-06", calories: 720.5, protein: 35, fat: 19, carbs: 95, mealCount: 2 }
  ]);
});

test("weight chart keeps the latest positive reading for each local day", () => {
  const points = latestWeightPerDay([
    { measuredAt: new Date("2026-10-05T17:00:00.000Z"), value: 63.4 },
    { measuredAt: new Date("2026-10-05T20:00:00.000Z"), value: 63.2 },
    { measuredAt: new Date("2026-10-06T02:00:00.000Z"), value: 0 }
  ], { kind: "offset", minutes: 480 });

  assert.deepEqual(points, [{ at: "2026-10-05T20:00:00.000Z", value: 63.2 }]);
});
