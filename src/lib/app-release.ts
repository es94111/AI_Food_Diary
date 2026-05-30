import "server-only";
import { getObjectText, listKeys } from "@/lib/storage";

const DOWNLOADS_PREFIX = "downloads/";
const NOTES_PREFIX = "notes/";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type AppRelease = {
  /// Highest version found in downloads/ (e.g. "1.2.0"), or "" if none.
  version: string;
  /// Release notes from notes/<version>.md|.txt, or "".
  notes: string;
  /// S3 key of the latest APK to stream, or null.
  apkKey: string | null;
};

let cache: { at: number; value: AppRelease } | null = null;

function parseVersion(key: string): number[] | null {
  const m = key.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

/// Resolves the latest Android release from S3: the newest APK under
/// downloads/ (by version in its filename) and its notes under notes/.
/// Falls back to APP_* env vars when S3 is unavailable. Cached for 5 minutes.
export async function getLatestAppRelease(): Promise<AppRelease> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let value: AppRelease = {
    version: process.env.APP_LATEST_VERSION ?? "",
    notes: process.env.APP_RELEASE_NOTES ?? "",
    apkKey: null
  };

  try {
    const keys = await listKeys(DOWNLOADS_PREFIX);
    let best: { key: string; parts: number[] } | null = null;
    for (const key of keys) {
      if (!key.toLowerCase().endsWith(".apk")) continue;
      const parts = parseVersion(key);
      if (!parts) continue;
      if (!best || cmp(parts, best.parts) > 0) best = { key, parts };
    }
    if (best) {
      const version = best.parts.join(".");
      const notes =
        (await getObjectText(`${NOTES_PREFIX}${version}.md`)) ??
        (await getObjectText(`${NOTES_PREFIX}${version}.txt`)) ??
        process.env.APP_RELEASE_NOTES ??
        "";
      value = { version, notes, apkKey: best.key };
    }
  } catch {
    // S3 not configured / unreachable — keep the env fallback.
  }

  cache = { at: Date.now(), value };
  return value;
}

export function clearAppReleaseCache() {
  cache = null;
}
