import { decryptMeal, decryptSavedFood } from "@/lib/b2-crypto";
import type {
  MealOutput,
  SavedFoodOutput,
  WaterLogOutput,
} from "./schemas";

type MealRow = Parameters<typeof decryptMeal>[0] & {
  id: string;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  aiConfidence: unknown | null;
  eatenAt: Date;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    name: string | null;
    estimatedAmount: string | null;
    encName: unknown;
    encEstimatedAmount: unknown;
    calories: unknown;
    protein: unknown;
    fat: unknown;
    carbs: unknown;
    aiRating: string;
  }>;
};

type SavedFoodRow = Parameters<typeof decryptSavedFood>[0] & {
  id: string;
  barcode: string | null;
  source: string;
  isFavorite: boolean;
  useCount: number;
  lastUsedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function rating(value: string): MealOutput["items"][number]["aiRating"] {
  return value === "GOOD" || value === "OK" || value === "LIMIT"
    ? value
    : "MANUAL";
}

export function mealToMcpOutput(row: MealRow): MealOutput {
  const meal = decryptMeal(row);
  return {
    id: row.id,
    mealType: row.mealType,
    totalCalories: meal.totalCalories,
    totalProtein: meal.totalProtein,
    totalFat: meal.totalFat,
    totalCarbs: meal.totalCarbs,
    aiConfidence:
      row.aiConfidence === null ? null : Number(row.aiConfidence),
    aiNotes: meal.aiNotes,
    imageCount: meal.imageCount,
    eatenAt: row.eatenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: meal.items.map((item) => ({
      id: String(item.id),
      name: item.name,
      estimatedAmount: item.estimatedAmount,
      calories: item.calories,
      protein: item.protein,
      fat: item.fat,
      carbs: item.carbs,
      aiRating: rating(String(item.aiRating)),
    })),
  };
}

export function savedFoodToMcpOutput(row: SavedFoodRow): SavedFoodOutput {
  const food = decryptSavedFood(row);
  return {
    id: row.id,
    barcode: row.barcode,
    name: food.name,
    estimatedAmount: food.estimatedAmount,
    brand: food.brand,
    calories: food.calories,
    protein: food.protein,
    fat: food.fat,
    carbs: food.carbs,
    source: row.source,
    isFavorite: row.isFavorite,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    hasImage: food.hasImage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function waterLogToMcpOutput(row: {
  id: string;
  amountMl: number;
  drankAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): WaterLogOutput {
  return {
    id: row.id,
    amountMl: row.amountMl,
    drankAt: row.drankAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

