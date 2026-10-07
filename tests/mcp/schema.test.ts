import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMealInputSchema,
  createSavedFoodInputSchema,
  createWaterLogInputSchema,
  getHealthDataInputSchema,
  getWeeklySummaryInputSchema,
  restoreAiActivitySchema,
} from "../../src/lib/mcp/schemas";

test("create schemas reject undeclared fields and user identity claims", () => {
  const meal = createMealInputSchema.safeParse({
    mealType: "LUNCH",
    userId: "attacker-controlled",
    items: [{ name: "Rice", estimatedAmount: "1 bowl", calories: 300, protein: 6, fat: 1, carbs: 65 }]
  });
  assert.equal(meal.success, false);

  const food = createSavedFoodInputSchema.safeParse({
    name: "Apple",
    estimatedAmount: "1 piece",
    calories: 80,
    protein: 0,
    fat: 0,
    carbs: 21,
    owner_id: "attacker-controlled"
  });
  assert.equal(food.success, false);
});

test("create schemas accept bounded create-only payloads", () => {
  assert.equal(createMealInputSchema.safeParse({
    mealType: "DINNER",
    items: [{ name: "Tofu", estimatedAmount: "100 g", calories: 90, protein: 10, fat: 5, carbs: 2 }]
  }).success, true);
  assert.equal(createWaterLogInputSchema.safeParse({ amountMl: 350 }).success, true);
  assert.equal(createSavedFoodInputSchema.safeParse({ name: "Apple", estimatedAmount: "1 piece", calories: 80, protein: 0, fat: 0, carbs: 21 }).success, true);
});

test("meal create rejects aggregate nutrition totals outside its output contract", () => {
  const result = createMealInputSchema.safeParse({
    mealType: "DINNER",
    items: [
      { name: "Item one", estimatedAmount: "1", calories: 6_000, protein: 600, fat: 1, carbs: 1 },
      { name: "Item two", estimatedAmount: "1", calories: 6_000, protein: 600, fat: 1, carbs: 1 },
    ],
  });
  assert.equal(result.success, false);
});

test("meal create image URLs must be https, well-formed, and bounded in count", () => {
  const base = {
    mealType: "DINNER" as const,
    items: [{ name: "Tofu", estimatedAmount: "100 g", calories: 90, protein: 10, fat: 5, carbs: 2 }],
  };
  assert.equal(
    createMealInputSchema.safeParse({ ...base, imageUrls: ["https://example.com/a.jpg"] }).success,
    true,
  );
  assert.equal(
    createMealInputSchema.safeParse({ ...base, imageUrls: ["http://example.com/a.jpg"] }).success,
    false,
  );
  assert.equal(createMealInputSchema.safeParse({ ...base, imageUrls: ["not-a-url"] }).success, false);
  assert.equal(
    createMealInputSchema.safeParse({ ...base, imageUrls: Array(6).fill("https://example.com/a.jpg") })
      .success,
    false,
  );
});

test("health and weekly summary read schemas enforce bounded, identity-free inputs", () => {
  const health = getHealthDataInputSchema.safeParse({ types: ["WEIGHT", "SLEEP"] });
  assert.equal(health.success, true);
  if (health.success) assert.equal(health.data.limit, 30);
  assert.equal(getHealthDataInputSchema.safeParse({ types: [] }).success, false);
  assert.equal(
    getHealthDataInputSchema.safeParse({ types: ["WEIGHT", "WEIGHT"] }).success,
    false,
  );
  assert.equal(
    getHealthDataInputSchema.safeParse({ types: ["WEIGHT", "STEPS", "SLEEP", "EXERCISE", "SLEEP_DEEP", "ACTIVE_CALORIES"] }).success,
    false,
  );
  assert.equal(
    getHealthDataInputSchema.safeParse({ types: ["HEART_RATE"] }).success,
    false,
  );
  assert.equal(
    getHealthDataInputSchema.safeParse({ types: ["WEIGHT"], limit: 6 }).success,
    false,
  );
  assert.equal(
    getHealthDataInputSchema.safeParse({ types: ["WEIGHT"], limit: 121 }).success,
    false,
  );
  assert.equal(
    getHealthDataInputSchema.safeParse({ types: ["WEIGHT"], userId: "attacker" }).success,
    false,
  );

  assert.equal(getWeeklySummaryInputSchema.safeParse({ date: "2026-09-28" }).success, true);
  assert.equal(getWeeklySummaryInputSchema.safeParse({ date: "2026-02-30" }).success, false);
  assert.equal(getWeeklySummaryInputSchema.safeParse({ userId: "attacker" }).success, false);
});

test("restore API requires an explicit human confirmation field", () => {
  assert.equal(restoreAiActivitySchema.safeParse({ reason: "not enough" }).success, false);
  assert.equal(restoreAiActivitySchema.safeParse({ confirm: true, reason: "user confirmed" }).success, true);
});
