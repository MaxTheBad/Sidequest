import assert from "node:assert/strict";
import test from "node:test";
import { createQuestCalendarFile } from "../src/lib/quest-calendar.ts";

test("creates a stable QuestHat calendar event", () => {
  const output = createQuestCalendarFile({
    id: "quest-123",
    title: "Market, coffee & plans",
    description: "Meet by the entrance; bring a tote.",
    startsAt: "2026-10-03T14:00:00.000Z",
    location: "South Florida",
    url: "https://questhat.com/listing/quest-123",
  }, new Date("2026-10-02T12:00:00.000Z"));

  assert.match(output, /DTSTART:20261003T140000Z/);
  assert.match(output, /DTEND:20261003T160000Z/);
  assert.match(output, /SUMMARY:Market\\, coffee & plans/);
  assert.match(output, /LOCATION:South Florida/);
  assert.match(output, /URL:https:\/\/questhat.com\/listing\/quest-123/);
});

test("rejects an invalid quest start time", () => {
  assert.throws(() => createQuestCalendarFile({ id: "quest-123", title: "Quest", startsAt: "not-a-date" }), /valid start time/);
});
