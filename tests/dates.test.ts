import assert from "node:assert/strict";
import test from "node:test";
import { localDateTimeToUtc, timeStrInTz } from "../src/lib/dates";

test("converts a selected local meal time to UTC in the user's IANA timezone", () => {
  assert.equal(
    localDateTimeToUtc("2026-10-06T19:45", { kind: "iana", tz: "Asia/Taipei" })?.toISOString(),
    "2026-10-06T11:45:00.000Z"
  );
});

test("converts local meal time using a fixed timezone offset", () => {
  assert.equal(
    localDateTimeToUtc("2026-10-06T19:45", { kind: "offset", minutes: 480 })?.toISOString(),
    "2026-10-06T11:45:00.000Z"
  );
});

test("rejects invalid dates, times, and nonexistent daylight-saving wall times", () => {
  assert.equal(localDateTimeToUtc("2026-02-30T12:00", { kind: "iana", tz: "Asia/Taipei" }), null);
  assert.equal(localDateTimeToUtc("2026-10-06T25:00", { kind: "iana", tz: "Asia/Taipei" }), null);
  assert.equal(localDateTimeToUtc("2026-03-08T02:30", { kind: "iana", tz: "America/New_York" }), null);
});

test("formats the current time in a fixed timezone offset", () => {
  assert.equal(timeStrInTz({ kind: "offset", minutes: 480 }, new Date("2026-10-06T11:45:00.000Z")), "19:45");
});
