import { encryptJson } from "./encryption";
import { decryptField } from "./field-crypto";

type MealItemLike = {
  name?: string | null;
  estimatedAmount?: string | null;
  encName?: unknown;
  encEstimatedAmount?: unknown;
  protein?: unknown;
  fat?: unknown;
  carbs?: unknown;
};

type SavedFoodLike = MealItemLike;

type DailySummaryLike = {
  aiSummary?: string | null;
  aiRecommendation?: string | null;
  encAiSummary?: unknown;
  encAiRecommendation?: unknown;
  totalProtein?: unknown;
  totalFat?: unknown;
  totalCarbs?: unknown;
};

type DecryptedMealItem<T> = Omit<
  T,
  "name" | "estimatedAmount" | "encName" | "encEstimatedAmount" | "protein" | "fat" | "carbs"
> & {
  name: string;
  estimatedAmount: string;
  protein: number;
  fat: number;
  carbs: number;
};

type DecryptedDailySummary<T> = Omit<
  T,
  "aiSummary" | "aiRecommendation" | "encAiSummary" | "encAiRecommendation" | "totalProtein" | "totalFat" | "totalCarbs"
> & {
  aiSummary: string;
  aiRecommendation: string;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
};

type MealItemOf<T> = T extends { items?: (infer I)[] }
  ? I extends MealItemLike
    ? I
    : MealItemLike
  : MealItemLike;

export function encryptMealItemWrite(item: {
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  aiRating?: string;
}): {
  name: null;
  estimatedAmount: null;
  encName: ReturnType<typeof encryptJson>;
  encEstimatedAmount: ReturnType<typeof encryptJson>;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  aiRating: string;
} {
  return {
    name: null,
    estimatedAmount: null,
    encName: encryptJson(item.name),
    encEstimatedAmount: encryptJson(item.estimatedAmount),
    calories: item.calories,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    aiRating: item.aiRating ?? "MANUAL"
  };
}

export function encryptMealNotesWrite(notes: string | null | undefined) {
  return {
    aiNotes: null,
    encAiNotes: notes ? encryptJson(notes) : undefined
  };
}

export function decryptMealItem<T extends MealItemLike>(item: T): DecryptedMealItem<T> {
  const {
    name,
    estimatedAmount,
    encName: _encName,
    encEstimatedAmount: _encEstimatedAmount,
    protein,
    fat,
    carbs,
    ...rest
  } = item;
  return {
    ...rest,
    name: decryptField<string>(_encName, name ?? ""),
    estimatedAmount: decryptField<string>(_encEstimatedAmount, estimatedAmount ?? ""),
    protein: Number(protein ?? 0),
    fat: Number(fat ?? 0),
    carbs: Number(carbs ?? 0)
  } as DecryptedMealItem<T>;
}

export function encryptSavedFoodWrite(food: {
  barcode?: string;
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source?: string;
  isFavorite?: boolean;
}) {
  return {
    barcode: food.barcode ?? null,
    name: null,
    estimatedAmount: null,
    encName: encryptJson(food.name),
    encEstimatedAmount: encryptJson(food.estimatedAmount),
    calories: food.calories,
    protein: food.protein,
    fat: food.fat,
    carbs: food.carbs,
    source: food.source ?? "MANUAL",
    isFavorite: food.isFavorite ?? false
  };
}

export function decryptSavedFood<T extends SavedFoodLike>(food: T) {
  return decryptMealItem(food);
}

export function encryptDailySummaryWrite(summary: {
  aiSummary: string;
  aiRecommendation: string;
}) {
  return {
    aiSummary: null,
    aiRecommendation: null,
    encAiSummary: encryptJson(summary.aiSummary),
    encAiRecommendation: encryptJson(summary.aiRecommendation)
  };
}

export function decryptDailySummary<T extends DailySummaryLike>(summary: T): DecryptedDailySummary<T> {
  const {
    aiSummary,
    aiRecommendation,
    encAiSummary: _encAiSummary,
    encAiRecommendation: _encAiRecommendation,
    totalProtein,
    totalFat,
    totalCarbs,
    ...rest
  } = summary;
  return {
    ...rest,
    aiSummary: decryptField<string>(_encAiSummary, aiSummary ?? ""),
    aiRecommendation: decryptField<string>(_encAiRecommendation, aiRecommendation ?? ""),
    totalProtein: Number(totalProtein ?? 0),
    totalFat: Number(totalFat ?? 0),
    totalCarbs: Number(totalCarbs ?? 0)
  } as DecryptedDailySummary<T>;
}

export function decryptMeal<
  T extends {
    items?: MealItemLike[];
    totalProtein?: unknown;
    totalFat?: unknown;
    totalCarbs?: unknown;
    aiNotes?: string | null;
    encAiNotes?: unknown;
  }
>(
  meal: T
): Omit<T, "items" | "totalProtein" | "totalFat" | "totalCarbs" | "aiNotes" | "encAiNotes"> & {
  items: DecryptedMealItem<MealItemOf<T>>[];
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  aiNotes: string | null;
} {
  const { items, totalProtein, totalFat, totalCarbs, aiNotes, encAiNotes: _encAiNotes, ...rest } = meal;
  return {
    ...rest,
    totalProtein: Number(totalProtein ?? 0),
    totalFat: Number(totalFat ?? 0),
    totalCarbs: Number(totalCarbs ?? 0),
    aiNotes: decryptField<string | null>(_encAiNotes, aiNotes ?? null),
    items: (items as MealItemOf<T>[] | undefined)?.map((item) => decryptMealItem(item)) ?? []
  };
}
