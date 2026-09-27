import assert from "node:assert/strict";
import test from "node:test";

import { ageFromBirthDate } from "../src/lib/people-discovery.ts";

function yearsAgo(years, dayOffset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

test("calculates an adult age on the birthday boundary", () => {
  assert.equal(ageFromBirthDate(yearsAgo(18)), 18);
});

test("does not round a future birthday up to 18", () => {
  assert.equal(ageFromBirthDate(yearsAgo(18, 1)), 17);
});

test("rejects empty and invalid birth dates", () => {
  assert.equal(ageFromBirthDate(""), null);
  assert.equal(ageFromBirthDate("not-a-date"), null);
});
