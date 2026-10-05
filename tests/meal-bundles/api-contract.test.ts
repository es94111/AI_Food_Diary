import assert from "node:assert/strict";
import { test } from "node:test";
import { mealBundleCreateSchema, mealBundlePatchSchema } from "../../src/lib/validators";

const item = {
  name: "白飯",
  estimatedAmount: "1 碗",
  calories: 280,
  protein: 5,
  fat: 1,
  carbs: 62
};

test("meal bundle creation accepts custom items and saved-food references", () => {
  const custom = mealBundleCreateSchema.safeParse({ name: "午餐", items: [item] });
  assert.equal(custom.success, true);

  const savedFood = mealBundleCreateSchema.safeParse({
    name: "午餐",
    items: [{ ...item, savedFoodId: "food-1" }]
  });
  assert.equal(savedFood.success, true);

  const clearedReference = mealBundlePatchSchema.safeParse({
    items: [{ ...item, savedFoodId: null }]
  });
  assert.equal(clearedReference.success, true);
});

test("meal bundles can be created from a meal without client-supplied items", () => {
  assert.equal(mealBundleCreateSchema.safeParse({ name: "固定早餐", sourceMealId: "meal-1" }).success, true);
  assert.equal(mealBundleCreateSchema.safeParse({ name: "空餐組" }).success, false);
});

test("meal bundle validation bounds item count and rejects empty updates", () => {
  const tooMany = Array.from({ length: 51 }, (_, index) => ({ ...item, name: `食物${index}` }));
  assert.equal(mealBundleCreateSchema.safeParse({ name: "超大餐組", items: tooMany }).success, false);
  assert.equal(mealBundlePatchSchema.safeParse({}).success, false);
});
