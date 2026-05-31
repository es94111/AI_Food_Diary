import "server-only";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

type RateLimitResult = { allowed: boolean; remaining: number; resetSec: number };

// In-process fallback used when Redis is not configured / unreachable. This is
// per-instance only (so it doesn't share state across replicas), but it still
// blunts abuse in single-instance / dev deployments.
const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryHit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();

  // Opportunistically drop expired entries so the map can't grow unbounded.
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  }

  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, resetSec: windowSec };
  }
  entry.count += 1;
  const resetSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetSec };
}

// Fixed-window counter. Redis-backed (atomic INCR + EXPIRE) when available,
// otherwise an in-process fallback. Fails open (allows the request) only if the
// fallback itself throws — never silently disables limiting when Redis is down,
// because the memory path covers that case.
async function hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, windowSec);
        return { allowed: true, remaining: limit - 1, resetSec: windowSec };
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
  return memoryHit(key, limit, windowSec);
}

type EnforceOptions = {
  limit: number;
  windowSec: number;
  message?: string;
};

// Records a hit and returns a 429 response when the limit is exceeded, or null
// when the request may proceed. Usage:
//   const limited = await enforceRateLimit(`login:ip:${ip}`, { limit: 10, windowSec: 300 });
//   if (limited) return limited;
export async function enforceRateLimit(
  key: string,
  { limit, windowSec, message }: EnforceOptions
): Promise<NextResponse | null> {
  const result = await hit(key, limit, windowSec);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: message ?? "請求過於頻繁，請稍後再試。" },
    { status: 429, headers: { "Retry-After": String(result.resetSec) } }
  );
}

// Shared per-user budget across every AI-spending endpoint (image/text/manual/
// nutrition-label analysis, daily summary, next-meal advice). Caps the cost a
// single account can run up against the operator's (or its own) API key.
export function enforceAiRateLimit(userId: string): Promise<NextResponse | null> {
  return enforceRateLimit(`ai:${userId}`, {
    limit: 40,
    windowSec: 300,
    message: "AI 分析請求過於頻繁，請稍後再試。"
  });
}
