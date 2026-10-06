import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateWeek, weekWindow } from "../../src/lib/weekly-summary-stats";

const TAIPEI = { kind: "iana", tz: "Asia/Taipei" } as const;
const UTC_PLUS_8 = { kind: "offset", minutes: 480 } as const;

test("weekly window snaps any day to Mon–Sun in the user's timezone", () => {
  const window = weekWindow("2026-10-06", UTC_PLUS_8);
  assert.equal(window.startDate, "2026-10-05");
  assert.equal(window.endDate, "2026-10-11");
  assert.equal(window.endDateExclusive, "2026-10-12");
  assert.equal(window.daysInWeek, 7);
  assert.equal(window.dates.length, 7);
  // Monday 00:00 Taipei == Sunday 16:00 UTC.
  assert.equal(window.start.toISOString(), "2026-10-04T16:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-10-11T16:00:00.000Z");
});

test("weekly window starts on the given Monday itself", () => {
  const window = weekWindow("2026-10-05", TAIPEI);
  assert.equal(window.startDate, "2026-10-05");
  assert.equal(window.endDate, "2026-10-11");
});

test("weekly window handles a week that spans a month boundary", () => {
  const window = weekWindow("2026-09-02", TAIPEI);
  assert.equal(window.startDate, "2026-08-31");
  assert.equal(window.endDate, "2026-09-06");
});

test("weekly aggregation sums meals and water and averages over all 7 days", () => {
  const window = weekWindow("2026-10-06", UTC_PLUS_8);
  const aggregate = aggregateWeek(
    window,
    UTC_PLUS_8,
    [
      { eatenAt: new Date("2026-10-05T17:00:00.000Z"), totalCalories: "600", totalProtein: "30", totalFat: "20", totalCarbs: "60" },
      { eatenAt: new Date("2026-10-06T02:00:00.000Z"), totalCalories: 400, totalProtein: 20, totalFat: 10, totalCarbs: 40 }
    ],
    [500, 250, 250]
  );

  // Both meals fall on Monday 2026-10-05 in UTC+8.
  assert.equal(aggregate.daysLogged, 1);
  assert.deepEqual(aggregate.totals, { calories: 1000, protein: 50, fat: 30, carbs: 100 });
  assert.equal(aggregate.waterTotalMl, 1000);
  assert.equal(aggregate.averages.calories, 1000 / 7);
  assert.equal(aggregate.averages.protein, 50 / 7);
  assert.equal(aggregate.averages.waterMl, 1000 / 7);
});

test("weekly aggregation reports no logged days for an empty week", () => {
  const window = weekWindow("2026-10-06", UTC_PLUS_8);
  const aggregate = aggregateWeek(window, UTC_PLUS_8, [], []);
  assert.equal(aggregate.daysLogged, 0);
  assert.deepEqual(aggregate.totals, { calories: 0, protein: 0, fat: 0, carbs: 0 });
  assert.equal(aggregate.waterTotalMl, 0);
});

test("weekly aggregation ignores meals outside the window in local time", () => {
  const window = weekWindow("2026-10-06", UTC_PLUS_8);
  const aggregate = aggregateWeek(
    window,
    UTC_PLUS_8,
    [
      // Monday 2026-10-05 01:00 UTC+8 → inside the week.
      { eatenAt: new Date("2026-10-04T17:00:00.000Z"), totalCalories: 100, totalProtein: 1, totalFat: 1, totalCarbs: 1 },
      // Sunday 2026-10-04 07:00 UTC+8 → previous week, must be excluded.
      { eatenAt: new Date("2026-10-03T23:00:00.000Z"), totalCalories: 999, totalProtein: 9, totalFat: 9, totalCarbs: 9 },
      // Monday 2026-10-12 01:00 UTC+8 → next week, must be excluded.
      { eatenAt: new Date("2026-10-11T17:00:00.000Z"), totalCalories: 888, totalProtein: 8, totalFat: 8, totalCarbs: 8 }
    ],
    []
  );

  assert.equal(aggregate.daysLogged, 1);
  assert.equal(aggregate.totals.calories, 100);
});
