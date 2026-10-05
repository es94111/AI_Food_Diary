import assert from "node:assert/strict";
import { test } from "node:test";

process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";

import { mealImagePaths, savedFoodImagePath } from "../../src/lib/image-links";
import { parseSignedImageQuery, verifyImageSignature } from "../../src/lib/storage";
import { signedImageCacheControl, withImageWidth } from "../../src/lib/image-url";

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
  assert.ok(signed?.startsWith("/api/images?"));
  const ref = parseSignedImageQuery(new URL(signed!, "https://example.com"));
  assert.ok(ref);
  assert.equal(ref.key, "meals/u1/a.jpg");
  assert.equal(verifyImageSignature("user", ref), true);

  const legacy = savedFoodImagePath({ id: "food-1", imageStorageKey: "data:image/png;base64,AAAA" });
  assert.equal(legacy, "/api/saved-foods/food-1/image");

  assert.equal(savedFoodImagePath({ id: "food-1", imageStorageKey: null }), null);
});

test("thumbnail width is appended correctly to both signed and legacy image URLs", () => {
  assert.equal(withImageWidth("/api/saved-foods/food-1/image", 256), "/api/saved-foods/food-1/image?w=256");
  assert.equal(withImageWidth("/api/images?k=meals%2Fu1%2Fa.jpg&e=1&s=abc", 256), "/api/images?k=meals%2Fu1%2Fa.jpg&e=1&s=abc&w=256");
});

test("private cache never outlives a signed link", () => {
  assert.equal(signedImageCacheControl(120_000, 0), "private, max-age=60");
  assert.equal(signedImageCacheControl(15_000, 0), "private, max-age=15");
  assert.equal(signedImageCacheControl(-1, 0), "private, max-age=0");
});
