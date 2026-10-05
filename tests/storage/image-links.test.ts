import assert from "node:assert/strict";
import { test } from "node:test";

process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";

import { mealImagePaths, savedFoodImagePath } from "../../src/lib/image-links";
import { signedImagePath } from "../../src/lib/storage";

test("object-storage meal photos become signed /api/images links", () => {
  const paths = mealImagePaths(
    { imageStorageKey: "meals/u1/a.jpg", imageStorageKeys: ["meals/u1/a.jpg", "meals/u1/b.png"] },
    "meal-1"
  );
  assert.equal(paths.length, 2);
  assert.ok(paths.every((p) => p.startsWith("/api/images?")));
  assert.ok(paths.every((p) => !p.includes("/api/meals/")));
});

test("legacy inline meal photos fall back to the authenticated meal route", () => {
  const legacy = "data:image/png;base64,AAAA";
  const paths = mealImagePaths({ imageStorageKey: legacy, imageStorageKeys: [] }, "meal-1");
  assert.deepEqual(paths, ["/api/meals/meal-1/image?i=0"]);
});

test("saved-food photos sign object keys and fall back for legacy rows", () => {
  const signed = savedFoodImagePath({ id: "food-1", imageStorageKey: "meals/u1/a.jpg" });
  assert.equal(signed, signedImagePath("user", "meals/u1/a.jpg"));

  const legacy = savedFoodImagePath({ id: "food-1", imageStorageKey: "data:image/png;base64,AAAA" });
  assert.equal(legacy, "/api/saved-foods/food-1/image");

  assert.equal(savedFoodImagePath({ id: "food-1", imageStorageKey: null }), null);
});
