import "server-only";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

type RateLimitResult = { allowed: boolean; remaining: number; resetSec: number };

// In-process fallback used when Redis is not configured / unreachable. This is
// per-instance only (so it doesn't share state across replicas), but it still
// blunts abuse in single-instance / dev deployments.
const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryHit(key: string, limit: number, windowSec: number, cost: number): RateLimitResult {
  const now = Date.now();

  // Opportunistically drop expired entries so the map can't grow unbounded.
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  }

  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: cost, expiresAt: now + windowSec * 1000 });
    return { allowed: cost <= limit, remaining: Math.max(0, limit - cost), resetSec: windowSec };
  }
  entry.count += cost;
  const resetSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetSec };
}

// Fixed-window counter. Redis-backed (atomic INCRBY + EXPIRE) when available,
// otherwise an in-process fallback. Fails open (allows the request) only if the
// fallback itself throws — never silently disables limiting when Redis is down,
// because the memory path covers that case. `cost` lets one request consume
// several units (e.g. precise mode fires multiple provider calls).
async function hit(key: string, limit: number, windowSec: number, cost: number): Promise<RateLimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incrby(redisKey, cost);
      if (count === cost) {
        await redis.expire(redisKey, windowSec);
        return { allowed: cost <= limit, remaining: Math.max(0, limit - cost), resetSec: windowSec };
      }
      let ttl = await redis.ttl(redisKey);
      if (ttl < 0) {
        // Key exists without a TTL (shouldn't happen) — repair it.
        await redis.expire(redisKey, windowSec);
        ttl = windowSec;
      }
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSec: ttl };
    } catch (err) {
      console.error("[rate-limit] redis error, falling back to memory:", err);
    }
  }
  return memoryHit(key, limit, windowSec, cost);
}

type EnforceOptions = {
  limit: number;
  windowSec: number;
  message?: string;
  // How many units this request consumes from the bucket (default 1).
  cost?: number;
};

// Records a hit and returns a 429 response when the limit is exceeded, or null
// when the request may proceed. Usage:
//   const limited = await enforceRateLimit(`some-scope:${key}`, { limit: 10, windowSec: 300 });
//   if (limited) return limited;
export async function enforceRateLimit(
  key: string,
  { limit, windowSec, message, cost = 1 }: EnforceOptions
): Promise<NextResponse | null> {
  const result = await hit(key, limit, windowSec, cost);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: message ?? "請求過於頻繁，請稍後再試。" },
    { status: 429, headers: { "Retry-After": String(result.resetSec) } }
  );
}

// Shared per-user budget across every AI-spending endpoint (image/text/manual/
// nutrition-label analysis, daily summary, next-meal advice). Caps the cost a
// single account can run up against the operator's (or its own) API key.
// `cost` > 1 for requests that trigger multiple provider calls at once (e.g.
// precise mode's parallel samples) so they can't multiply their real budget.
export function enforceAiRateLimit(userId: string, cost = 1): Promise<NextResponse | null> {
  return enforceRateLimit(`ai:${userId}`, {
    limit: 40,
    windowSec: 300,
    cost,
    message: "AI 分析請求過於頻繁，請稍後再試。"
  });
}

// Separate, narrower budget for the brand-search web-search step. Unlike the
// per-user AI key above, the web-search API key is operator-level and shared
// across every user (see research.md §5), so it needs its own limit to keep a
// single account from burning through the whole operator's monthly quota.
export function enforceBrandSearchRateLimit(userId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`brand-search:${userId}`, {
    limit: 10,
    windowSec: 600,
    message: "品牌搜尋請求過於頻繁，請稍後再試。"
  });
}

// Write endpoints that upload images / fan out DB rows had no budget at all,
// letting a scripted account grow S3 storage and Postgres rows without bound
// (a cost attack). These are generous — well above any real usage pattern —
// but stop unlimited loops.
export function enforceMealWriteRateLimit(userId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`write:meal:${userId}`, {
    limit: 40,
    windowSec: 600,
    message: "餐點建立過於頻繁，請稍後再試。"
  });
}

export function enforceSavedFoodWriteRateLimit(userId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`write:saved-food:${userId}`, {
    limit: 60,
    windowSec: 600,
    message: "儲存食物操作過於頻繁，請稍後再試。"
  });
}

// The admin data export/import endpoints decrypt or rewrite the whole database,
// so their budgets are far tighter than user endpoints — an accidental script
// loop must not churn full-database reads/writes.
export function enforceAdminDataExportRateLimit(adminId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`admin:data-export:${adminId}`, {
    limit: 3,
    windowSec: 600,
    message: "匯出請求過於頻繁，請稍後再試。"
  });
}

export function enforceAdminDataImportRateLimit(adminId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`admin:data-import:${adminId}`, {
    limit: 2,
    windowSec: 3600,
    message: "匯入請求過於頻繁，請稍後再試。"
  });
}

// Each sync batch can carry up to 500 metrics inside a transaction; a modest
// hourly budget is far above any real Health Connect cadence.
export function enforceHealthSyncRateLimit(userId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`write:health-sync:${userId}`, {
    limit: 30,
    windowSec: 3600,
    message: "健康資料同步過於頻繁，請稍後再試。"
  });
}
