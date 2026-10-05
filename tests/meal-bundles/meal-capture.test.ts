import assert from "node:assert/strict";
import { test } from "node:test";
import { mealPhotoDataUrlsForSave } from "../../src/lib/meal-capture";

test("meal photos selected before adding a bundle are retained in the manual draft", () => {
  const previews = ["data:image/jpeg;base64,photo"];
  assert.deepEqual(mealPhotoDataUrlsForSave("manual", previews, true), previews);
});

test("photos are sent only for the active capture mode or an explicitly preserved manual draft", () => {
  const previews = ["data:image/jpeg;base64,photo"];
  assert.equal(mealPhotoDataUrlsForSave("manual", previews, false), undefined);
  assert.equal(mealPhotoDataUrlsForSave("describe", previews, true), undefined);
  assert.deepEqual(mealPhotoDataUrlsForSave("photo", previews, false), previews);
  assert.equal(mealPhotoDataUrlsForSave("photo", [], false), undefined);
});
