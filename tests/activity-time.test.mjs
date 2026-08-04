import assert from "node:assert/strict";
import test from "node:test";

import { formatActivityTime, formatPostedTime } from "../src/lib/activity-time.ts";

const NOW = new Date("2026-08-04T16:00:00.000Z").getTime();

function before(milliseconds) {
  return new Date(NOW - milliseconds).toISOString();
}

test("formats activity under one hour in minutes", () => {
  assert.equal(formatActivityTime(before(30_000), NOW), "Just now");
  assert.equal(formatActivityTime(before(60_000), NOW), "1 min ago");
  assert.equal(formatActivityTime(before(59 * 60_000), NOW), "59 mins ago");
});

test("formats activity under one day in hours", () => {
  assert.equal(formatActivityTime(before(60 * 60_000), NOW), "1 hour ago");
  assert.equal(formatActivityTime(before(23 * 60 * 60_000), NOW), "23 hours ago");
});

test("formats activity under one week in days", () => {
  assert.equal(formatActivityTime(before(24 * 60 * 60_000), NOW), "1 day ago");
  assert.equal(formatActivityTime(before(6 * 24 * 60 * 60_000), NOW), "6 days ago");
});

test("uses a calendar date at one week and prefixes quest timestamps", () => {
  const oldDate = new Date(NOW - 7 * 24 * 60 * 60_000);
  const expected = oldDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  assert.equal(formatActivityTime(oldDate, NOW), expected);
  assert.equal(formatPostedTime(before(2 * 60 * 60_000), NOW), "Posted 2 hours ago");
});
