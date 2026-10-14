import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnalyticsFailure, minutesBucket, resultBucket, runQuestJoinRequest } from "../src/lib/product-analytics.ts";
import { readFileSync } from "node:fs";

test("analytics uses only coarse result and duration buckets", () => {
  assert.deepEqual([resultBucket(0), resultBucket(1), resultBucket(6), resultBucket(21)], ["empty", "1_5", "6_20", "21_plus"]);
  assert.equal(minutesBucket("2026-10-11T00:00:00Z", "2026-10-11T00:31:00Z"), "30m_2h");
  assert.equal(minutesBucket(null, "2026-10-11T00:31:00Z"), null);
});

test("join outcomes honor the supplied live consent gate on normal and distance-confirmed paths", async () => {
  const events = [];
  let consent = false, requests = 0;
  const capture = (name, properties) => { if (consent) events.push({ name, properties }); };
  await runQuestJoinRequest(async () => { requests++; return { error: null }; }, capture, { joinMode: "open", surface: "listing" });
  assert.equal(requests, 1);
  assert.equal(events.length, 0);
  consent = true;
  for (const joinMode of ["open", "approval_required"]) {
    events.length = 0;
    await runQuestJoinRequest(async () => ({ error: null }), capture, { joinMode, surface: "listing" });
    assert.deepEqual(events.map(e => e.name), ["quest_join_attempted", "quest_join_requested"]);
    assert.equal(events[1].properties.join_status, joinMode === "open" ? "approved" : "pending");
    assert.deepEqual(Object.keys(events[1].properties).sort(), ["join_mode", "join_status", "outcome", "platform", "surface"]);
  }
  const listing = readFileSync(new URL("../src/app/listing/[id]/listing-client.tsx", import.meta.url), "utf8");
  assert.equal((listing.match(/await runQuestJoinRequest\(/g) || []).length, 2);
  assert.match(listing, /import \{ captureProductEvent \} from "@\/components\/posthog-provider"/);
});

test("withdrawal while joining suppresses late success; analytics failure cannot block the request", async () => {
  const events = [];
  let consent = true, resolve;
  const pending = runQuestJoinRequest(() => new Promise(r => { resolve = r; }), (name, properties) => { if (consent) events.push({ name, properties }); }, { joinMode: "open", surface: "listing" });
  consent = false;
  resolve({ error: null });
  await pending;
  assert.deepEqual(events.map(e => e.name), ["quest_join_attempted"]);
  let requests = 0;
  await runQuestJoinRequest(async () => { requests++; return { error: null }; }, () => { throw new Error("analytics unavailable"); }, { surface: "home" });
  assert.equal(requests, 1);
});

test("backend failures and duplicate retries never advertise a fresh successful join or leak details", async () => {
  for (const [error, category, outcome] of [
    [{ message: "permission denied by row-level security: private address", code: "42501" }, "auth", "failed"],
    [{ message: "rate limit for private@example.invalid" }, "rate_limited", "failed"],
    [{ message: "private constraint name", code: "23505" }, "duplicate", "duplicate"],
  ]) {
    const events = [];
    const result = await runQuestJoinRequest(async () => ({ error }), (name, properties) => events.push({ name, properties }), { joinMode: "unexpected private value", surface: "listing" });
    assert.equal(result.error, error);
    assert.deepEqual(events.map(e => e.name), ["quest_join_attempted", "quest_join_result"]);
    assert.equal(events[1].properties.failure_category, category);
    assert.equal(events[1].properties.outcome, outcome);
    assert.doesNotMatch(JSON.stringify(events), /private|42501|23505|unexpected/);
  }
  const events = [];
  await assert.rejects(runQuestJoinRequest(async () => { throw new Error("network error near private address"); }, (name, properties) => events.push({ name, properties }), { surface: "listing" }), /network error/);
  assert.equal(events[1].properties.failure_category, "network");
  assert.doesNotMatch(JSON.stringify(events), /private address/);
});

test("analytics failure categories never retain server error text", () => {
  assert.equal(classifyAnalyticsFailure(new Error("rate limit: retry")), "rate_limited");
  assert.equal(classifyAnalyticsFailure(new Error("secret address leaked")), "unknown");
});
