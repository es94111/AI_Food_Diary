export const MEAL_DRAFT_STORAGE_PREFIX = "ai-food-diary:meal-draft:";
export const MEAL_DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DRAFT_CHARACTERS = 64 * 1024;
const MAX_ITEMS = 50;

export type MealDraftItem = {
  name: string;
  estimatedAmount: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  aiRating: string;
};

export type MealDraft = {
  mode: "photo" | "describe" | "manual";
  mealType: string;
  eatenAtLocal: string;
  description: string;
  preciseMode: boolean;
  manualItems: MealDraftItem[];
  confirmItems: MealDraftItem[];
  confirmMealType: string;
  confirmEatenAt: string;
  confirmDate: string;
  showConfirm: boolean;
};

export interface DraftStorage {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

const mealTypes = new Set(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
const ratings = new Set(["GOOD", "OK", "LIMIT", "MANUAL"]);

export function mealDraftStorageKey(userId: string) {
  return `${MEAL_DRAFT_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function saveMealDraft(storage: DraftStorage, userId: string, draft: MealDraft, now = Date.now()) {
  const normalized = normalizeMealDraft(draft);
  if (!normalized) throw new Error("Invalid meal draft");
  const serialized = JSON.stringify({ version: 1, savedAt: now, draft: normalized });
  if (serialized.length > MAX_DRAFT_CHARACTERS) throw new Error("Meal draft exceeds the local storage limit");
  storage.setItem(mealDraftStorageKey(userId), serialized);
}

export function loadMealDraft(storage: DraftStorage, userId: string, now = Date.now()): MealDraft | null {
  const key = mealDraftStorageKey(userId);
  const serialized = storage.getItem(key);
  if (!serialized) return null;

  try {
    if (serialized.length > MAX_DRAFT_CHARACTERS) {
      storage.removeItem(key);
      return null;
    }
    const stored = JSON.parse(serialized) as { version?: unknown; savedAt?: unknown; draft?: unknown };
    if (
      stored.version !== 1 ||
      typeof stored.savedAt !== "number" ||
      !Number.isFinite(stored.savedAt) ||
      stored.savedAt > now + 60_000 ||
      now - stored.savedAt > MEAL_DRAFT_RETENTION_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    const draft = normalizeMealDraft(stored.draft);
    if (!draft) storage.removeItem(key);
    return draft;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function removeMealDraft(storage: DraftStorage, userId: string) {
  storage.removeItem(mealDraftStorageKey(userId));
}

export function clearMealDrafts(storage: DraftStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(MEAL_DRAFT_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

function normalizeMealDraft(value: unknown): MealDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  if (
    (draft.mode !== "photo" && draft.mode !== "describe" && draft.mode !== "manual") ||
    typeof draft.mealType !== "string" || !mealTypes.has(draft.mealType) ||
    typeof draft.eatenAtLocal !== "string" || draft.eatenAtLocal.length > 32 ||
    typeof draft.description !== "string" || draft.description.length > 1200 ||
    typeof draft.preciseMode !== "boolean" ||
    typeof draft.confirmMealType !== "string" || !mealTypes.has(draft.confirmMealType) ||
    typeof draft.confirmEatenAt !== "string" || draft.confirmEatenAt.length > 64 ||
    typeof draft.confirmDate !== "string" || draft.confirmDate.length > 16 ||
    typeof draft.showConfirm !== "boolean" ||
    !Array.isArray(draft.manualItems) || draft.manualItems.length > MAX_ITEMS ||
    !Array.isArray(draft.confirmItems) || draft.confirmItems.length > MAX_ITEMS
  ) return null;

  const manualItems = draft.manualItems.map(normalizeItem);
  const confirmItems = draft.confirmItems.map(normalizeItem);
  if (manualItems.some((item) => !item) || confirmItems.some((item) => !item)) return null;

  return {
    mode: draft.mode,
    mealType: draft.mealType,
    eatenAtLocal: draft.eatenAtLocal,
    description: draft.description,
    preciseMode: draft.preciseMode,
    manualItems: manualItems as MealDraftItem[],
    confirmItems: confirmItems as MealDraftItem[],
    confirmMealType: draft.confirmMealType,
    confirmEatenAt: draft.confirmEatenAt,
    confirmDate: draft.confirmDate,
    showConfirm: draft.showConfirm
  };
}

function normalizeItem(value: unknown): MealDraftItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const fields = ["name", "estimatedAmount", "calories", "protein", "fat", "carbs"] as const;
  if (fields.some((field) => typeof item[field] !== "string" || (item[field] as string).length > 240)) return null;
  if (typeof item.aiRating !== "string" || !ratings.has(item.aiRating)) return null;
  return {
    name: item.name as string,
    estimatedAmount: item.estimatedAmount as string,
    calories: item.calories as string,
    protein: item.protein as string,
    fat: item.fat as string,
    carbs: item.carbs as string,
    aiRating: item.aiRating
  };
}
