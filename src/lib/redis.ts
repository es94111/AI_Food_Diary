import "server-only";
import Redis from "ioredis";

// Shared ioredis client, reused across hot-reloads in dev via globalThis so we
// don't leak connections. Returns null when REDIS_URL is not configured, in
// which case callers fall back to their in-process behaviour.
const globalForRedis = globalThis as unknown as { redisClient?: Redis | null };

export function getRedis(): Redis | null {
  if (globalForRedis.redisClient !== undefined) return globalForRedis.redisClient;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    globalForRedis.redisClient = null;
    return null;
  }

  try {
    const client = new Redis(url, {
      // Fail fast and let callers fall back instead of hanging a request when
      // Redis is unreachable.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000
    });
    client.on("error", (err) => {
      console.error("[redis] connection error:", err.message);
    });
    globalForRedis.redisClient = client;
  } catch (err) {
    console.error("[redis] failed to initialise:", err);
    globalForRedis.redisClient = null;
  }

  return globalForRedis.redisClient ?? null;
}
