import assert from "node:assert/strict";
import test from "node:test";
import {
  MEAL_DRAFT_RETENTION_MS,
  MEAL_DRAFT_STORAGE_PREFIX,
  clearMealDrafts,
  loadMealDraft,
  mealDraftStorageKey,
  saveMealDraft,
  type DraftStorage,
  type MealDraft
} from "../../src/lib/meal-draft";
import { clearPwaCaches, clearPwaLocalStorage, isPwaLogoutInProgress, setPwaLogoutInProgress, type PwaCacheStorage } from "../../src/lib/pwa-storage";

class MemoryStorage implements DraftStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

const draft: MealDraft = {
  mode: "manual",
  mealType: "LUNCH",
  eatenAtLocal: "2026-10-07T12:15",
  description: "一碗飯和青菜",
  preciseMode: false,
  manualItems: [{ name: "白飯", estimatedAmount: "一碗", calories: "240", protein: "4", fat: "0", carbs: "53", aiRating: "MANUAL" }],
  confirmItems: [],
  confirmMealType: "LUNCH",
  confirmEatenAt: "",
  confirmDate: "2026-10-07",
  showConfirm: false
};

test("meal drafts are isolated by account and recover within their retention window", () => {
  const storage = new MemoryStorage();
  saveMealDraft(storage, "account-a", draft, 1_000);

  assert.deepEqual(loadMealDraft(storage, "account-a", 1_000 + 10), draft);
  assert.equal(loadMealDraft(storage, "account-b", 1_000 + 10), null);
  assert.equal(storage.getItem(mealDraftStorageKey("account-a"))?.includes("savedFoodId"), false);
});

test("expired and malformed meal drafts are removed", () => {
  const storage = new MemoryStorage();
  saveMealDraft(storage, "account-a", draft, 1_000);
  assert.equal(loadMealDraft(storage, "account-a", 1_000 + MEAL_DRAFT_RETENTION_MS + 1), null);
  assert.equal(storage.getItem(mealDraftStorageKey("account-a")), null);

  storage.setItem(mealDraftStorageKey("account-a"), "not-json");
  assert.equal(loadMealDraft(storage, "account-a", 2_000), null);
  assert.equal(storage.getItem(mealDraftStorageKey("account-a")), null);
});

test("loaded drafts discard unknown fields and invalid drafts are rejected", () => {
  const storage = new MemoryStorage();
  const key = mealDraftStorageKey("account-a");
  const privateFoodId = { ...draft.manualItems[0], savedFoodId: "other-account-food" };
  storage.setItem(key, JSON.stringify({ version: 1, savedAt: 1_000, draft: { ...draft, manualItems: [privateFoodId] } }));
  const loaded = loadMealDraft(storage, "account-a", 1_000);
  assert.ok(loaded);
  assert.equal("savedFoodId" in loaded.manualItems[0], false);

  storage.setItem(key, JSON.stringify({ version: 1, savedAt: 1_000, draft: { ...draft, mealType: "UNKNOWN" } }));
  assert.equal(loadMealDraft(storage, "account-a", 1_000), null);
  assert.equal(storage.getItem(key), null);
});

test("logout clears app-owned drafts and cache names without touching unrelated storage", async () => {
  setPwaLogoutInProgress(true);
  assert.equal(isPwaLogoutInProgress(), true);
  setPwaLogoutInProgress(false);
  assert.equal(isPwaLogoutInProgress(), false);

  const localStorage = new MemoryStorage();
  localStorage.setItem(`${MEAL_DRAFT_STORAGE_PREFIX}account-a`, "draft");
  localStorage.setItem("daily-summary-popup-date", "2026-10-07");
  localStorage.setItem("unrelated-preference", "keep");
  clearPwaLocalStorage(localStorage);
  assert.equal(localStorage.getItem(`${MEAL_DRAFT_STORAGE_PREFIX}account-a`), null);
  assert.equal(localStorage.getItem("daily-summary-popup-date"), null);
  localStorage.setItem(`${MEAL_DRAFT_STORAGE_PREFIX}account-b`, "draft");
  clearMealDrafts(localStorage);
  assert.equal(localStorage.getItem(`${MEAL_DRAFT_STORAGE_PREFIX}account-b`), null);
  assert.equal(localStorage.getItem("unrelated-preference"), "keep");

  const removed: string[] = [];
  const cacheStorage: PwaCacheStorage = {
    async keys() { return ["ai-food-diary-static-v1", "other-app-cache"]; },
    async delete(name) { removed.push(name); return true; }
  };
  await clearPwaCaches(cacheStorage);
  assert.deepEqual(removed, ["ai-food-diary-static-v1"]);
});
