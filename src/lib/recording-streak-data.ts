import { prisma } from "@/lib/db";
import type { TzSpec } from "@/lib/dates";
import { calculateRecordingStreak } from "@/lib/recording-streak";

/** Load only timestamps needed for the user's all-time streak; food details stay in the DB. */
export async function getRecordingStreak(userId: string, timeZone: TzSpec, now = new Date()) {
  const [meals, waterLogs] = await Promise.all([
    prisma.meal.findMany({
      where: { userId, eatenAt: { lte: now } },
      select: { eatenAt: true }
    }),
    prisma.waterLog.findMany({
      where: { userId, drankAt: { lte: now } },
      select: { drankAt: true }
    })
  ]);

  return calculateRecordingStreak(
    [...meals.map(({ eatenAt }) => eatenAt), ...waterLogs.map(({ drankAt }) => drankAt)],
    timeZone,
    now
  );
}
