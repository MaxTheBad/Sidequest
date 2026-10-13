import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attendanceState, createFollowUpActionRunner, followUpPayload, getFollowUpEligibility, questLifecyclePayload } from "../src/lib/post-quest-followup.js";

const sql = readFileSync(new URL("../supabase/migrations/20261011110000_post_quest_followups.sql", import.meta.url), "utf8");
const mobilePackage = readFileSync(new URL("../apps/mobile/package.json", import.meta.url), "utf8");
const webCard = readFileSync(new URL("../src/components/post-quest-followup.tsx", import.meta.url), "utf8");
const mobileApp = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../apps/mobile/src/lib/native-review.js", import.meta.url), "utf8");
const now = Date.parse("2026-10-11T12:00:00Z");

test("follow-up never infers completion from starts_at and respects cancellation/rescheduling", () => {
  assert.equal(getFollowUpEligibility({ quest: { starts_at: "2020-01-01T00:00:00Z" }, userId: "u", approvedParticipant: true, now }).reason, "no-end-basis");
  assert.equal(getFollowUpEligibility({ quest: { ends_at: "2026-10-12T12:00:00Z" }, userId: "u", approvedParticipant: true, now }).reason, "not-ended");
  assert.equal(getFollowUpEligibility({ quest: { ends_at: "2020-01-01T00:00:00Z", status: "cancelled" }, userId: "u", approvedParticipant: true, now }).reason, "cancelled");
  assert.equal(getFollowUpEligibility({ quest: { completed_at: "2026-10-11T11:00:00Z" }, userId: "u", approvedParticipant: true, now }).eligible, true);
  assert.equal(getFollowUpEligibility({ quest: { city: "virtual", ends_at: "2026-10-11T11:00:00Z" }, userId: "u", approvedParticipant: true, now }).eligible, true);
});

test("host lifecycle rejects cancellation, unauthorized writes, and invalid/future completion", () => {
  const quest = { id: "q", creator_id: "host", starts_at: "2026-10-11T10:00:00Z" };
  assert.deepEqual(questLifecyclePayload({ quest, userId: "host", endsAt: "2026-10-11T11:00:00Z", markCompleted: true, now }), { p_quest_id: "q", p_ends_at: "2026-10-11T11:00:00.000Z", p_mark_completed: true });
  for (const input of [
    { userId: "guest", endsAt: "2026-10-11T11:00:00Z" },
    { userId: "host", endsAt: "invalid" },
    { userId: "host", endsAt: "2026-10-11T09:00:00Z" },
    { userId: "host", endsAt: "2026-10-12T11:00:00Z", markCompleted: true },
  ]) assert.throws(() => questLifecyclePayload({ quest, now, ...input }));
  assert.throws(() => questLifecyclePayload({ quest: { ...quest, status: "cancelled" }, userId: "host", endsAt: "2026-10-11T11:00:00Z", now }), /Cancelled/);
  const future = questLifecyclePayload({ quest, userId: "host", endsAt: "2026-10-12T11:00:00Z", now });
  assert.equal(getFollowUpEligibility({ quest: { ...quest, ends_at: future.p_ends_at }, userId: "host", isHost: true, now }).eligible, false);
});

test("follow-up writes serialize, recover after rejection, and discard interrupted completions", async () => {
  const runner = createFollowUpActionRunner();
  const updates = [];
  const callbacks = { onBusy: busy => updates.push(busy), onSuccess: data => updates.push(data), onError: error => updates.push(error.message) };
  let resolve;
  const first = runner.run(() => new Promise(done => { resolve = done; }), callbacks);
  assert.equal(await runner.run(() => { throw new Error("duplicate write"); }, callbacks), false);
  runner.invalidate();
  resolve({ data: "stale success" });
  await first;
  assert.deepEqual(updates, [true]);
  updates.length = 0;
  await runner.run(async () => { throw new Error("network failure"); }, callbacks);
  assert.deepEqual(updates, [true, "network failure", false]);
  updates.length = 0;
  await runner.run(async () => ({ error: { message: "not authorized" } }), callbacks);
  assert.deepEqual(updates, [true, "not authorized", false]);
  updates.length = 0;
  await runner.run(async () => ({ data: "saved" }), callbacks);
  assert.deepEqual(updates, [true, "saved", false]);
});

test("listing loads gated lifecycle fields and mounts account-keyed follow-up controls", () => {
  const listing = readFileSync(new URL("../src/app/listing/[id]/listing-client.tsx", import.meta.url), "utf8");
  assert.match(listing, /NEXT_PUBLIC_POST_QUEST_FOLLOW_UPS === "true" \? "ends_at,completed_at,status,"/);
  assert.match(listing, /<PostQuestFollowUp key=/);
  assert.match(listing, /approvedParticipant=\{myMembershipStatus === "approved"\}/);
  assert.match(listing, /isHost=\{isOwner\}/);
  assert.match(webCard, /runner\.invalidate\(\)/);
  assert.match(webCard, /supabase\.rpc\("set_quest_lifecycle"/);
});

test("attendance remains unknown or disputed rather than becoming a no-show penalty", () => {
  assert.equal(attendanceState({ attendeeWent: undefined, hostConfirmedAttendance: true }), "unknown");
  assert.equal(attendanceState({ attendeeWent: true, hostConfirmedAttendance: false }), "disputed");
  assert.equal(attendanceState({ attendeeWent: false, hostConfirmedAttendance: false }), "confirmed");
});

test("payloads are scoped and ratings are private bounded input", () => {
  assert.deepEqual(followUpPayload({ questId: "q", went: true, rating: 4 }), { p_quest_id: "q", p_went: true, p_rating: 4 });
  assert.throws(() => followUpPayload({ questId: "q", went: true, rating: 6 }), /between 1 and 5/);
});

test("backend contract authorizes approved participants/hosts and is idempotent", () => {
  assert.match(sql, /primary key \(quest_id, user_id\)/);
  assert.match(sql, /on conflict \(quest_id, user_id\) do update/i);
  assert.match(sql, /Only the host and approved attendees can submit follow-ups/);
  assert.match(sql, /Only the host can confirm attendance/);
  assert.match(sql, /m\.status = 'approved'/);
  assert.match(sql, /went boolean null/);
  assert.match(sql, /p_user_id, null, p_attended/);
  assert.match(sql, /invalidate_quest_completion_on_lifecycle_change/);
  assert.match(sql, /Only the host can update the quest lifecycle/);
  assert.match(sql, /p_ends_at < quest_row\.starts_at/);
  assert.match(sql, /quest_row\.completed_at is null and \(quest_row\.ends_at is null or quest_row\.ends_at > now\(\)\)/);
  assert.match(sql, /Cancelled quests cannot receive follow-ups/);
  assert.doesNotMatch(sql, /score|reputation|ban/i);
});

test("follow-up UI is capability-gated and native review is not sentiment-routed", () => {
  assert.match(webCard, /NEXT_PUBLIC_POST_QUEST_FOLLOW_UPS/);
  assert.match(webCard, /Conflicts remain disputed/);
  assert.match(mobilePackage, /expo-store-review/);
  assert.match(mobileApp, /<PostQuestFollowUpCard/);
  assert.match(mobileApp, /POST_QUEST_FOLLOW_UPS_ENABLED/);
  assert.match(reviewSource, /StoreReview\.isAvailableAsync/);
  assert.match(reviewSource, /REVIEW_COOLDOWN_MS/);
  assert.match(reviewSource, /milestone !== "quest_detail_opened"/);
  assert.doesNotMatch(reviewSource, /rating|went/);
  const followUpHandler = mobileApp.slice(mobileApp.indexOf("async function saveSelectedQuestFollowUp"), mobileApp.indexOf("async function confirmSelectedQuestAttendance"));
  assert.doesNotMatch(followUpHandler, /requestNeutralEngagementReview/);
});
