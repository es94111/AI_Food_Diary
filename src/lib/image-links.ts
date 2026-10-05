import "server-only";
import { isStorageKey, signedImagePath } from "./storage";

// Photo URLs handed to the web UI. Object-storage photos get a short-lived
// signed link to /api/images (the private bucket's streaming endpoint), which
// keeps them out of any public/cached URL; legacy inline data-URL rows cannot be
// signed, so they keep streaming through the authenticated per-meal route.
export function mealImagePaths(
  meal: { imageStorageKey: string | null; imageStorageKeys: string[] },
  mealId: string
): string[] {
  const keys = meal.imageStorageKeys.length ? meal.imageStorageKeys : meal.imageStorageKey ? [meal.imageStorageKey] : [];
  return keys.map((key, index) => (isStorageKey(key) ? signedImagePath("user", key) : `/api/meals/${mealId}/image?i=${index}`));
}

export function savedFoodImagePath(food: { id: string; imageStorageKey: string | null }): string | null {
  if (!food.imageStorageKey) return null;
  return isStorageKey(food.imageStorageKey)
    ? signedImagePath("user", food.imageStorageKey)
    : `/api/saved-foods/${food.id}/image`;
}
