import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearDeletedAccountPwaState,
  type AccountDeletionBrowserCleanup,
} from "../../src/lib/account-deletion-client";
import type { PwaCacheStorage, PwaStorage } from "../../src/lib/pwa-storage";

class MemoryStorage implements PwaStorage {
  private readonly entries = new Map<string, string>();

  get length() {
    return this.entries.size;
  }

  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }

  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }

  removeItem(key: string) {
    this.entries.delete(key);
  }

  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
}

function cacheStorage(names: string[], deleted: string[]): PwaCacheStorage {
  return {
    async keys() {
      return names;
    },
    async delete(name) {
      deleted.push(name);
      return true;
    },
  };
}

function bothCleared(): AccountDeletionBrowserCleanup {
  return { localStorageCleared: true, cachesCleared: true };
}

test("successful account deletion clears PWA drafts, app state, and only app-owned caches", async () => {
  const storage = new MemoryStorage();
  storage.setItem("ai-food-diary:meal-draft:user-a", "private draft");
  storage.setItem("daily-summary-popup-date", "2026-10-07");
  storage.setItem("unrelated-preference", "keep");
  const deletedCaches: string[] = [];

  const result = await clearDeletedAccountPwaState(
    storage,
    cacheStorage(["ai-food-diary-static-v1", "another-app-cache"], deletedCaches),
  );

  assert.deepEqual(result, bothCleared());
  assert.equal(storage.getItem("ai-food-diary:meal-draft:user-a"), null);
  assert.equal(storage.getItem("daily-summary-popup-date"), null);
  assert.equal(storage.getItem("unrelated-preference"), "keep");
  assert.deepEqual(deletedCaches, ["ai-food-diary-static-v1"]);
});

test("PWA cache cleanup still runs when local storage cleanup throws", async () => {
  const deletedCaches: string[] = [];
  const storage: PwaStorage = {
    length: 1,
    key: () => "ai-food-diary:meal-draft:user-a",
    removeItem() {
      throw new Error("storage unavailable");
    },
  };

  const result = await clearDeletedAccountPwaState(
    storage,
    cacheStorage(["ai-food-diary-static-v1"], deletedCaches),
  );

  assert.deepEqual(result, { localStorageCleared: false, cachesCleared: true });
  assert.deepEqual(deletedCaches, ["ai-food-diary-static-v1"]);
});

test("local storage cleanup still runs when PWA cache cleanup throws", async () => {
  const storage = new MemoryStorage();
  storage.setItem("ai-food-diary:meal-draft:user-a", "private draft");
  const caches: PwaCacheStorage = {
    async keys() {
      throw new Error("cache storage unavailable");
    },
    async delete() {
      return false;
    },
  };

  const result = await clearDeletedAccountPwaState(storage, caches);

  assert.deepEqual(result, { localStorageCleared: true, cachesCleared: false });
  assert.equal(storage.getItem("ai-food-diary:meal-draft:user-a"), null);
});
