export const APP_LOCAL_STORAGE_PREFIX = "ai-food-diary:";
export const APP_CACHE_PREFIX = "ai-food-diary-";
const LEGACY_DAILY_SUMMARY_KEY = "daily-summary-popup-date";
let pwaLogoutInProgress = false;

export function setPwaLogoutInProgress(value: boolean) {
  pwaLogoutInProgress = value;
}

export function isPwaLogoutInProgress() {
  return pwaLogoutInProgress;
}

export interface PwaStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export interface PwaCacheStorage {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

export function clearPwaLocalStorage(storage: PwaStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(APP_LOCAL_STORAGE_PREFIX) || key === LEGACY_DAILY_SUMMARY_KEY) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export async function clearPwaCaches(storage: PwaCacheStorage) {
  const names = (await storage.keys()).filter((name) => name.startsWith(APP_CACHE_PREFIX));
  await Promise.all(names.map((name) => storage.delete(name)));
}
