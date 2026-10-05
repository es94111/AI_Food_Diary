export type MealCaptureMode = "photo" | "describe" | "manual";

export function mealPhotoDataUrlsForSave(
  mode: MealCaptureMode,
  previews: string[],
  attachPhotosToManualDraft: boolean
): string[] | undefined {
  const photosBelongToMeal = mode === "photo" || (mode === "manual" && attachPhotosToManualDraft);
  return photosBelongToMeal && previews.length > 0 ? previews : undefined;
}
