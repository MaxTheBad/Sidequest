import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasQuestEnded, isQuestClosedForJoining, nextQuestJoinBoundary } from "../src/lib/quest-join-eligibility.js";
import { isUnsafeProtectedPublicLabel } from "../src/lib/public-location-label.js";
import { feedMembershipAction } from "../src/lib/feed-card.js";

test("web lifecycle closes dated quests at their start boundary", () => {
  const now=Date.parse("2026-10-16T06:00:00Z");
  const past=new Date(now-1000).toISOString(), future=new Date(now+60000).toISOString();
  assert.equal(isQuestClosedForJoining({starts_at:past,ends_at:future,status:"open"},now),true);
  assert.equal(isQuestClosedForJoining({starts_at:past,status:"open"},now),true);
  assert.equal(isQuestClosedForJoining({starts_at:future,status:"open"},now),false);
  assert.equal(isQuestClosedForJoining({status:"open"},now),false);
  assert.equal(isQuestClosedForJoining({ends_at:past,status:"open"},now),true);
  assert.equal(isQuestClosedForJoining({completed_at:past,ends_at:future,status:"open"},now),true);
  assert.equal(isQuestClosedForJoining({ends_at:future,status:"cancelled"},now),true);
  assert.equal(isQuestClosedForJoining({ends_at:future,status:"full"},now),true);
  assert.equal(hasQuestEnded({ends_at:future,status:"full"},now),false);
});
test("web lifecycle schedules the earliest future join boundary", () => {
  const now = Date.parse("2026-10-16T06:00:00Z");
  const start = new Date(now + 60_000).toISOString();
  const end = new Date(now + 120_000).toISOString();
  assert.equal(nextQuestJoinBoundary({ starts_at: start, ends_at: end, status: "open" }, now), now + 60_000);
  assert.equal(nextQuestJoinBoundary({ starts_at: null, ends_at: end, status: "open" }, now), now + 120_000);
  assert.equal(nextQuestJoinBoundary({ starts_at: new Date(now).toISOString(), status: "open" }, now), null);
  assert.equal(nextQuestJoinBoundary({ starts_at: start, status: "cancelled" }, now), null);
  assert.equal(nextQuestJoinBoundary({ starts_at: null, ends_at: null, status: "open" }, now), null);
});
test("ended web controls preserve existing member cancellation and owner run-again", () => {
  assert.equal(feedMembershipAction({isExpired:true}).disabled,true);
  assert.equal(feedMembershipAction({isExpired:true,status:"pending"}).label,"Cancel request");
  assert.equal(feedMembershipAction({isExpired:true,isJoined:true}).label,"Leave quest");
  assert.equal(feedMembershipAction({isExpired:true,isOwner:true}).label,"Make again");
});
test("protected public labels reject synthetic streets without hiding public venues", () => {
  assert.equal(isUnsafeProtectedPublicLabel("private","123 Synthetic QA Street"),true);
  assert.equal(isUnsafeProtectedPublicLabel("approved_members","42 Test Rd"),true);
  assert.equal(isUnsafeProtectedPublicLabel("private","Miami, FL"),false);
  assert.equal(isUnsafeProtectedPublicLabel("public","123 Synthetic QA Street"),false);
});
test("web join retry and stale invitation results remain guarded", () => {
  const listing=readFileSync(new URL("../src/app/listing/[id]/listing-client.tsx",import.meta.url),"utf8");
  const inbox=readFileSync(new URL("../src/app/inbox/page.tsx",import.meta.url),"utf8");
  const home=readFileSync(new URL("../src/app/page.tsx",import.meta.url),"utf8");
  assert.match(listing,/nextQuestJoinBoundary\(listing, now\)/);
  assert.match(listing,/setTimeout\(refreshAndSchedule, Math\.min\(Math\.max\(0, boundary - now\), 2_147_483_647\)\)/);
  assert.match(listing,/if \(!userId\) \{\s*if \(isQuestClosedForJoining\(listing\)\) return setStatus\(QUEST_CLOSED_MESSAGE\);\s*return router\.push/);
  assert.match(listing,/disabled=\{listingClosedForJoining && !hasJoined/);
  assert.match(listing,/confirmDistanceJoin\(\)[\s\S]*?isQuestClosedForJoining\(listing\)/);
  assert.match(listing,/next === "approved" && isQuestClosedForJoining\(listing\)/);
  assert.match(inbox,/if \(changed !== true\) return setStatus/);
  assert.match(home,/confirmDistanceJoinQuest\(\)[\s\S]*?isQuestClosedForJoining\(quest\)/);
});
