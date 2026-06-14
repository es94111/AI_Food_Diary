// Timezone-aware date helpers.
//
// The app stores every instant (meal `eatenAt`, health `measuredAt`, ...) as a
// UTC timestamp, but "which calendar day does this belong to" and "what is
// today" must be answered in the *user's* timezone — not the server's process
// timezone (which is UTC in production). These helpers take an explicit `TzSpec`
// so day boundaries are always computed in the user's zone.

/** A user timezone: either an IANA zone name or a fixed UTC offset in minutes (east of UTC positive). */
export type TzSpec = { kind: "iana"; tz: string } | { kind: "offset"; minutes: number };

/** True when `tz` is a usable IANA timezone name on this runtime. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms, east of UTC positive) of an IANA zone at a given instant. */
function ianaOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - at.getTime();
}

/** Calendar arithmetic on a `yyyy-MM-dd` string (timezone-independent). */
export function addDaysStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** UTC instant of 00:00:00 wall-clock on `dateStr` in the given zone. */
export function dayStartUtc(dateStr: string, spec: TzSpec): Date {
  const utcMidnight = Date.parse(`${dateStr}T00:00:00Z`);
  if (spec.kind === "offset") {
    return new Date(utcMidnight - spec.minutes * 60000);
  }
  // Two passes settle the rare case where midnight falls inside a DST shift.
  const firstOffset = ianaOffsetMs(spec.tz, new Date(utcMidnight));
  let instant = utcMidnight - firstOffset;
  const secondOffset = ianaOffsetMs(spec.tz, new Date(instant));
  if (secondOffset !== firstOffset) instant = utcMidnight - secondOffset;
  return new Date(instant);
}

/** [start, end) UTC range covering the calendar day `dateStr` in the given zone. */
export function dayRangeUtc(dateStr: string, spec: TzSpec) {
  return { start: dayStartUtc(dateStr, spec), end: dayStartUtc(addDaysStr(dateStr, 1), spec) };
}

/** Monday-based week start (`yyyy-MM-dd`) for the week containing `dateStr`. */
export function weekStartStr(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysStr(dateStr, diff);
}

/** [start, end) UTC range covering the 7-day (Mon–Sun) week containing `dateStr`. */
export function weekRangeUtc(dateStr: string, spec: TzSpec) {
  const startStr = weekStartStr(dateStr);
  return {
    start: dayStartUtc(startStr, spec),
    end: dayStartUtc(addDaysStr(startStr, 7), spec),
    startStr
  };
}

/** Today's date (`yyyy-MM-dd`) as seen in the given zone. */
export function todayStr(spec: TzSpec, now = new Date()): string {
  if (spec.kind === "offset") {
    return new Date(now.getTime() + spec.minutes * 60000).toISOString().slice(0, 10);
  }
  // en-CA renders as yyyy-MM-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: spec.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** Current hour (0–23) as seen in the given zone. */
export function hourInTz(spec: TzSpec, now = new Date()): number {
  if (spec.kind === "offset") {
    return new Date(now.getTime() + spec.minutes * 60000).getUTCHours();
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: spec.tz,
    hourCycle: "h23",
    hour: "2-digit"
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Normalize a possibly-missing/invalid `date` param to `yyyy-MM-dd`, defaulting to today in `spec`. */
export function normalizeDateStr(value: string | null | undefined, spec: TzSpec): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayStr(spec);
}
