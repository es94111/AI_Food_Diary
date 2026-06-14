import "dotenv/config";

import { Queue, Worker } from "bullmq";
import { AiNotConfiguredError } from "@/lib/ai-config";
import { generateAndStoreDailySummary } from "@/lib/daily-summary";
import { addDaysStr, hourInTz, todayStr } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { resolveUserTz } from "@/lib/timezone";

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined
  };
}

const connection = redisConnection();

export const aiQueue = new Queue("ai-food-diary", { connection });

// Pre-compute each user's previous-day AI summary shortly after their local
// midnight, so the app/web can show it instantly on first open without ever
// running AI at open time. Runs hourly (see the repeatable job below) and acts
// only on users whose local time is in the 1 AM hour — that processes each user
// exactly once per day, after "yesterday" is fully complete, and stays correct
// across all timezones without a single global trigger time.
const PRECOMPUTE_SUMMARIES_JOB = "precompute-daily-summaries";

async function precomputeDailySummaries() {
  const now = new Date();
  const users = await prisma.user.findMany({
    select: { id: true, isAdmin: true, profile: true }
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const tz = resolveUserTz(null, user.profile?.timezone);
      if (hourInTz(tz, now) !== 1) {
        skipped++;
        continue;
      }
      const yesterday = addDaysStr(todayStr(tz, now), -1);
      const row = await generateAndStoreDailySummary(user, yesterday, tz);
      if (row) generated++;
      else skipped++; // no meals that day → nothing to summarise
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        skipped++; // user has no AI key — nothing to do
        continue;
      }
      failed++;
      console.error("daily-summary precompute failed for user %s: %s", user.id, (err as Error).message);
    }
  }

  console.log("daily-summary precompute: generated=%d skipped=%d failed=%d", generated, skipped, failed);
}

new Worker(
  "ai-food-diary",
  async (job) => {
    if (job.name === PRECOMPUTE_SUMMARIES_JOB) {
      await precomputeDailySummaries();
      return;
    }
    console.log("Received job %s", job.name, job.data);
  },
  { connection }
);

// Register the hourly trigger. BullMQ dedupes repeatable jobs by name + pattern,
// so re-adding on every worker restart is idempotent (no duplicate schedules).
await aiQueue.add(
  PRECOMPUTE_SUMMARIES_JOB,
  {},
  { repeat: { pattern: "5 * * * *" }, removeOnComplete: true, removeOnFail: 50 }
);

console.log("AI Food Diary worker is running");
