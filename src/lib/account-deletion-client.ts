import {
  clearPwaCaches,
  clearPwaLocalStorage,
  type PwaCacheStorage,
  type PwaStorage,
} from "@/lib/pwa-storage";

export type AccountDeletionBrowserCleanup = {
  localStorageCleared: boolean;
  cachesCleared: boolean;
};

export async function clearDeletedAccountPwaState(
  storage?: PwaStorage,
  cacheStorage?: PwaCacheStorage,
): Promise<AccountDeletionBrowserCleanup> {
  let localStorageCleared = false;
  let cachesCleared = false;

  try {
    const local = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (local) {
      clearPwaLocalStorage(local);
      localStorageCleared = true;
    }
  } catch {
    // Continue to cache cleanup even when browser storage is unavailable.
  }

  try {
    const cache = cacheStorage ??
      (typeof window !== "undefined" && "caches" in window ? window.caches : undefined);
    if (cache) {
      await clearPwaCaches(cache);
      cachesCleared = true;
    }
  } catch {
    // The account is already deleted; one local storage failure must not interrupt logout.
  }

  return { localStorageCleared, cachesCleared };
}
