import assert from "node:assert/strict";
import test from "node:test";
import { calculateRecordingStreak } from "../../src/lib/recording-streak";

const inZone = (timestamps: string[], zone: string, now: string) =>
  calculateRecordingStreak(
    timestamps.map((timestamp) => new Date(timestamp)),
    { kind: "iana", tz: zone },
    new Date(now)
  );

test("counts meal and water timestamps together once per user-local day", () => {
  assert.deepEqual(
    inZone(
      [
        "2026-10-06T03:00:00.000Z", // meal on Oct 6 in Taipei
        "2026-10-07T02:00:00.000Z", // water on Oct 7 in Taipei
        "2026-10-07T04:00:00.000Z", // another log on the same day
      ],
      "Asia/Taipei",
      "2026-10-07T04:30:00.000Z"
    ),
    { currentStreak: 2, longestStreak: 2, lastRecordedDate: "2026-10-07" }
  );
});

test("assigns the same UTC instant to different local calendar days across zones", () => {
  const timestamp = ["2026-01-01T23:30:00.000Z"];
  assert.deepEqual(inZone(timestamp, "Asia/Tokyo", "2026-01-02T00:30:00.000Z"), {
    currentStreak: 1,
    longestStreak: 1,
    lastRecordedDate: "2026-01-02"
  });
  assert.deepEqual(inZone(timestamp, "America/Los_Angeles", "2026-01-02T00:30:00.000Z"), {
    currentStreak: 1,
    longestStreak: 1,
    lastRecordedDate: "2026-01-01"
  });
});

test("keeps midnight boundaries on their correct side of the local day", () => {
  assert.equal(
    inZone(["2026-10-06T15:59:59.999Z"], "Asia/Taipei", "2026-10-06T16:00:00.000Z").lastRecordedDate,
    "2026-10-06"
  );
  assert.equal(
    inZone(["2026-10-06T16:00:00.000Z"], "Asia/Taipei", "2026-10-06T16:00:00.000Z").lastRecordedDate,
    "2026-10-07"
  );
});

test("uses local dates across the spring DST gap and ignores future timestamps", () => {
  assert.deepEqual(
    inZone(
      [
        "2026-03-08T04:59:59.999Z", // Mar 7, 23:59:59 EST
        "2026-03-08T05:00:00.000Z", // Mar 8, 00:00 EST
        "2026-03-09T04:00:00.000Z", // Mar 9, 00:00 EDT; after `now`
      ],
      "America/New_York",
      "2026-03-09T03:30:00.000Z" // Mar 8, 23:30 EDT
    ),
    { currentStreak: 2, longestStreak: 2, lastRecordedDate: "2026-03-08" }
  );
});

test("deduplicates the repeated fall DST hour within one local day", () => {
  assert.deepEqual(
    inZone(
      [
        "2026-11-01T03:59:59.999Z", // Oct 31, 23:59:59 EDT
        "2026-11-01T04:00:00.000Z", // Nov 1, 00:00 EDT
        "2026-11-01T05:30:00.000Z", // Nov 1, 01:30 EDT
        "2026-11-01T06:30:00.000Z", // Nov 1, 01:30 EST
      ],
      "America/New_York",
      "2026-11-02T04:30:00.000Z" // Nov 1, 23:30 EST
    ),
    { currentStreak: 2, longestStreak: 2, lastRecordedDate: "2026-11-01" }
  );
});

test("keeps yesterday's streak alive during today, but resets after a missed day", () => {
  const beforeTodayEnds = inZone(
    ["2026-10-05T10:00:00.000Z", "2026-10-06T10:00:00.000Z"],
    "Asia/Taipei",
    "2026-10-07T04:00:00.000Z"
  );
  assert.equal(beforeTodayEnds.currentStreak, 2);

  const broken = inZone(
    ["2026-10-04T10:00:00.000Z", "2026-10-05T10:00:00.000Z"],
    "Asia/Taipei",
    "2026-10-07T04:00:00.000Z"
  );
  assert.deepEqual(broken, { currentStreak: 0, longestStreak: 2, lastRecordedDate: "2026-10-05" });
});

test("returns a calm empty state when no logs exist", () => {
  assert.deepEqual(inZone([], "Asia/Taipei", "2026-10-07T04:00:00.000Z"), {
    currentStreak: 0,
    longestStreak: 0,
    lastRecordedDate: null
  });
});
