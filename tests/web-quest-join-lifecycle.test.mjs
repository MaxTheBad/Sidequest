import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasQuestEnded, isQuestClosedForJoining, nextQuestJoinBoundary } from "../src/lib/quest-join-eligibility.js";
import { createQuestJoinClock } from "../src/lib/quest-join-clock.js";
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
test("web lifecycle refreshes on foreground clock jumps and cleans up", () => {
  const listeners = new Map(), documentListeners = new Map(), timers = new Map(), ticks = [];
  const target = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const documentTarget = {
    visibilityState: "visible",
    addEventListener: (name, callback) => documentListeners.set(name, callback),
    removeEventListener: (name, callback) => { if (documentListeners.get(name) === callback) documentListeners.delete(name); },
  };
  const start = Date.parse("2026-10-16T06:01:00Z");
  let clock = start - 60_000, nextTimerId = 0;
  const cleanup = createQuestJoinClock({
    quest: { starts_at: new Date(start).toISOString(), status: "open" },
    now: () => clock, onTick: (value) => ticks.push(value), windowTarget: target, documentTarget,
    setTimeoutFn: (callback, delay) => { const id = ++nextTimerId; timers.set(id, { callback, delay }); return id; },
    clearTimeoutFn: (id) => timers.delete(id),
  });
  assert.deepEqual(ticks, [start - 60_000]);
  assert.deepEqual([...timers.values()].map(({ delay }) => delay), [60_000]);
  clock = start;
  listeners.get("focus")();
  assert.deepEqual(ticks, [start - 60_000, start]);
  assert.equal(timers.size, 0);
  documentTarget.visibilityState = "hidden";
  documentListeners.get("visibilitychange")();
  assert.equal(ticks.length, 2);
  documentTarget.visibilityState = "visible";
  clock = start + 1;
  documentListeners.get("visibilitychange")();
  assert.equal(ticks.at(-1), start + 1);
  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(documentListeners.size, 0);
});
test("web lifecycle reschedules only the current listing deadline", () => {
  const listeners = new Map(), timers = new Map();
  const target = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const documentTarget = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  const now = Date.parse("2026-10-16T06:00:00Z");
  let nextTimerId = 0;
  const options = {
    now: () => now, onTick() {}, windowTarget: target, documentTarget,
    setTimeoutFn: (callback, delay) => { const id = ++nextTimerId; timers.set(id, { callback, delay }); return id; },
    clearTimeoutFn: (id) => timers.delete(id),
  };
  const cleanFirst = createQuestJoinClock({ ...options, quest: { starts_at: new Date(now + 60_000).toISOString(), status: "open" } });
  assert.equal([...timers.values()][0].delay, 60_000);
  cleanFirst();
  assert.equal(timers.size, 0);
  const cleanSecond = createQuestJoinClock({ ...options, quest: { starts_at: null, status: "open" } });
  assert.equal(timers.size, 0);
  cleanSecond();
  assert.equal(listeners.size, 0);
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
  assert.match(listing,/createQuestJoinClock\(\{ quest: listing, onTick: setJoinClockNow \}\)/);
  assert.match(listing,/if \(!userId\) \{\s*if \(isQuestClosedForJoining\(listing\)\) return setStatus\(QUEST_CLOSED_MESSAGE\);\s*return router\.push/);
  assert.match(listing,/disabled=\{listingClosedForJoining && !hasJoined/);
  assert.match(listing,/confirmDistanceJoin\(\)[\s\S]*?isQuestClosedForJoining\(listing\)/);
  assert.match(listing,/next === "approved" && isQuestClosedForJoining\(listing\)/);
  assert.match(inbox,/if \(changed !== true\) return setStatus/);
  assert.match(home,/confirmDistanceJoinQuest\(\)[\s\S]*?isQuestClosedForJoining\(quest\)/);
});
test("manual exact-address grants close at the boundary while revocation remains available", () => {
  const listing=readFileSync(new URL("../src/app/listing/[id]/listing-client.tsx",import.meta.url),"utf8");
  const handler = listing.slice(listing.indexOf("async function toggleExactAccess"), listing.indexOf("async function blockMemberFromQuest"));
  assert.match(handler,/if \(allow && isQuestClosedForJoining\(listing\)\) return setStatus\(QUEST_CLOSED_MESSAGE\)/);
  assert.match(handler,/if \(allow\) \{[\s\S]*?\.upsert\(/);
  assert.match(handler,/\.delete\(\)\.eq\("quest_id", listing\.id\)\.eq\("user_id", targetUserId\)/);
  assert.match(listing,/disabled=\{!hasExactAccess && listingClosedForJoining\}[\s\S]{0,160}toggleExactAccess\(m\.user_id, !hasExactAccess\)/);
  const revokeStart = listing.indexOf('key={`exact-${m.user_id}`}');
  const revokeControl = listing.slice(revokeStart, listing.indexOf("</button>", revokeStart));
  assert.match(revokeControl,/toggleExactAccess\(m\.user_id, false\)/);
  assert.doesNotMatch(revokeControl,/disabled=/);
});
