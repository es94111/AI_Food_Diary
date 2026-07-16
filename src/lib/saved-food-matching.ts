export type SavedFoodMatchCandidate = {
  id: string;
  name: string;
  estimatedAmount: string;
  barcode?: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  archivedAt?: Date | string | null;
  [key: string]: unknown;
};

export type SavedFoodMatch = {
  food: SavedFoodMatchCandidate;
  reason: "barcode" | "name" | "similar";
  score: number;
  archived: boolean;
};

export function canonicalBarcode(value?: string | null): string | null {
  const normalized = value?.trim().replace(/[\s-]+/g, "") ?? "";
  return normalized || null;
}

export function normalizeFoodText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

function closeEnough(left: number, right: number, ratio: number): boolean {
  if (left === 0 && right === 0) return true;
  const baseline = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / baseline <= ratio;
}

function nutritionSimilarity(input: SavedFoodMatchCandidate, candidate: SavedFoodMatchCandidate): number {
  let score = 0;
  if (closeEnough(input.calories, candidate.calories, 0.05)) score += 0.2;
  if (closeEnough(input.protein, candidate.protein, 0.1)) score += 0.05;
  if (closeEnough(input.fat, candidate.fat, 0.1)) score += 0.05;
  if (closeEnough(input.carbs, candidate.carbs, 0.1)) score += 0.05;
  return score;
}

export function findSavedFoodMatches(
  input: SavedFoodMatchCandidate,
  foods: SavedFoodMatchCandidate[]
): { exactBarcode?: SavedFoodMatch; matches: SavedFoodMatch[] } {
  const inputBarcode = canonicalBarcode(input.barcode);
  const inputName = normalizeFoodText(input.name);
  const exactBarcodeFood = inputBarcode
    ? foods.find((food) => canonicalBarcode(food.barcode) === inputBarcode)
    : undefined;

  const exactBarcode = exactBarcodeFood
    ? {
        food: exactBarcodeFood,
        reason: "barcode" as const,
        score: 1,
        archived: !!exactBarcodeFood.archivedAt
      }
    : undefined;

  const matches = foods
    .filter((food) => food.id !== exactBarcodeFood?.id)
    .map((food): SavedFoodMatch | null => {
      const candidateName = normalizeFoodText(food.name);
      if (!inputName || !candidateName) return null;
      let score = nutritionSimilarity(input, food);
      let reason: SavedFoodMatch["reason"] = "similar";
      if (candidateName === inputName) {
        score += 0.7;
        reason = "name";
      } else if (candidateName.includes(inputName) || inputName.includes(candidateName)) {
        score += 0.5;
      }
      return score >= 0.7
        ? { food, reason, score: Math.min(1, score), archived: !!food.archivedAt }
        : null;
    })
    .filter((match): match is SavedFoodMatch => match !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  return { exactBarcode, matches };
}
