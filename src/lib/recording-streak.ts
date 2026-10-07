import { addDaysStr, todayStr, type TzSpec } from "@/lib/dates";

export type RecordingStreak = {
  currentStreak: number;
  longestStreak: number;
  lastRecordedDate: string | null;
};

/**
 * Count consecutive user-local calendar days containing at least one meal or
 * water log. A streak without a log today remains current through yesterday;
 * it resets once yesterday is also missing.
 */
export function calculateRecordingStreak(
  qualifyingTimestamps: readonly Date[],
  timeZone: TzSpec,
  now = new Date()
): RecordingStreak {
  const today = todayStr(timeZone, now);
  const recordedDates = new Set<string>();
  for (const timestamp of qualifyingTimestamps) {
    if (!Number.isFinite(timestamp.getTime())) continue;
    const date = todayStr(timeZone, timestamp);
    if (date <= today) recordedDates.add(date);
  }

  const dates = [...recordedDates].sort();
  let longestStreak = 0;
  let consecutiveDays = 0;
  let previousDate: string | null = null;
  for (const date of dates) {
    consecutiveDays = previousDate && addDaysStr(previousDate, 1) === date ? consecutiveDays + 1 : 1;
    longestStreak = Math.max(longestStreak, consecutiveDays);
    previousDate = date;
  }

  const yesterday = addDaysStr(today, -1);
  let streakEndDate = recordedDates.has(today) ? today : recordedDates.has(yesterday) ? yesterday : null;
  let currentStreak = 0;
  while (streakEndDate && recordedDates.has(streakEndDate)) {
    currentStreak += 1;
    streakEndDate = addDaysStr(streakEndDate, -1);
  }

  return {
    currentStreak,
    longestStreak,
    lastRecordedDate: dates.length ? dates[dates.length - 1] : null
  };
}
