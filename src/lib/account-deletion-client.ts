import {
  clearPwaCaches,
  clearPwaLocalStorage,
  type PwaCacheStorage,
  type PwaStorage,
} from "@/lib/pwa-storage";

export type BrowserCleanupStatus = "cleared" | "unavailable" | "failed";

export type AccountDeletionBrowserCleanup = {
  localStorage: BrowserCleanupStatus;
  caches: BrowserCleanupStatus;
};

export async function clearDeletedAccountPwaState(
  storage?: PwaStorage,
  cacheStorage?: PwaCacheStorage,
): Promise<AccountDeletionBrowserCleanup> {
  let localStorageStatus: BrowserCleanupStatus = "unavailable";
  let cacheStatus: BrowserCleanupStatus = "unavailable";

  try {
    const local = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (local) {
      clearPwaLocalStorage(local);
      localStorageStatus = "cleared";
    }
  } catch {
    localStorageStatus = "failed";
  }

  try {
    const cache = cacheStorage ??
      (typeof window !== "undefined" && "caches" in window ? window.caches : undefined);
    if (cache) {
      await clearPwaCaches(cache);
      cacheStatus = "cleared";
    }
  } catch {
    cacheStatus = "failed";
  }

  return { localStorage: localStorageStatus, caches: cacheStatus };
}
