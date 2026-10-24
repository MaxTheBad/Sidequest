import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shareQuestAndRecord, shareQuestPayload } from "../src/lib/share-quest.js";

const payload = { title: "Private title", text: "Private description", url: "https://questhat.com/listing/private-id?secret=yes" };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test("Android handoff counts only after native completion, under the original user activation", async () => {
  const done = deferred();
  let launched = false, counted = 0;
  const outcomes = [];
  const pending = shareQuestAndRecord({ userAgentData: { platform: "Android" }, share: data => { assert.deepEqual(data, { url: payload.url }); launched = true; return done.promise; } }, payload, {
    recordShare: async method => { assert.equal(method, "native"); counted++; return true; },
    onOutcome: result => outcomes.push(result),
  });
  assert.equal(launched, true, "share must launch before any bookkeeping await");
  assert.equal(counted, 0);
  assert.equal(outcomes.length, 0);
  done.resolve();
  const result = await pending;
  assert.equal(counted, 1);
  assert.equal(result.outcome, "completed");
  assert.equal(result.confirmation, "handoff", "a target handoff is not recipient delivery");
  assert.equal(result.counted, true);
  assert.doesNotMatch(JSON.stringify(outcomes), /Private|private-id|secret|https:/);
});

test("system share targets receive only the canonical listing URL", async () => {
  let shared;
  const result = await shareQuestPayload({ userAgent: "Macintosh", share: async data => { shared = data; } }, payload);
  assert.deepEqual(shared, { url: payload.url });
  assert.doesNotMatch(JSON.stringify(shared), /Private title|Private description/);
  assert.equal(result.method, "native");
});

test("Windows and unknown native platforms remain initiated and do not count", async () => {
  for (const identity of [{ userAgentData: { platform: "Windows" }, userAgent: "Android" }, { userAgent: "Macintosh" }, {}]) {
    let counted = 0;
    const result = await shareQuestAndRecord({ ...identity, share: async () => {} }, payload, { recordShare: async () => { counted++; return true; }, onOutcome: () => {} });
    assert.equal(result.outcome, "initiated");
    assert.equal(result.confirmation, "none");
    assert.equal(counted, 0);
  }
});

test("native cancellation and an active native dialog never copy or count", async () => {
  for (const name of ["AbortError", "InvalidStateError"]) {
    let copied = 0, counted = 0;
    const result = await shareQuestAndRecord({ share: async () => { throw Object.assign(new Error("private failure details"), { name }); }, clipboard: { writeText: async () => { copied++; } } }, payload, {
      recordShare: async () => { counted++; return true; }, onOutcome: () => {},
    });
    assert.equal(result.outcome, name === "AbortError" ? "cancelled" : "failed");
    assert.equal(copied, 0);
    assert.equal(counted, 0);
  }
});

test("clipboard fallback counts the completed copy, not a native share or final delivery", async () => {
  const copied = deferred();
  let count = 0, copiedUrl;
  const pending = shareQuestAndRecord({ share: async () => { throw new Error("unsupported"); }, clipboard: { writeText: url => { copiedUrl = url; return copied.promise; } } }, payload, {
    recordShare: async method => { assert.equal(method, "clipboard"); count++; return true; }, onOutcome: () => {},
  });
  await Promise.resolve();
  assert.equal(copiedUrl, payload.url);
  assert.equal(count, 0);
  copied.resolve();
  const result = await pending;
  assert.equal(result.confirmation, "copy");
  assert.equal(result.outcome, "completed");
  assert.equal(count, 1);
});

test("unsupported and rejected clipboard paths do not count or expose errors", async () => {
  for (const navigator of [{}, { clipboard: { writeText: async () => { throw new Error("secret address"); } } }]) {
    let count = 0;
    const result = await shareQuestAndRecord(navigator, payload, { recordShare: async () => { count++; return true; }, onOutcome: () => {} });
    assert.equal(result.shouldCount, false);
    assert.equal(count, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret address|private-id/);
  }
});

test("bookkeeping and analytics failures never reinterpret a successful copy as a failed share", async () => {
  const navigator = { clipboard: { writeText: async () => {} } };
  const failedCount = await shareQuestAndRecord(navigator, payload, { recordShare: async () => { throw new Error("private database error"); }, onOutcome: () => { throw new Error("analytics unavailable"); } });
  assert.equal(failedCount.outcome, "completed");
  assert.equal(failedCount.counted, false);
  assert.equal(failedCount.countFailed, true);
  const cooldown = await shareQuestAndRecord(navigator, payload, { recordShare: async () => false, onOutcome: () => {} });
  assert.equal(cooldown.counted, false);
  assert.equal(cooldown.countFailed, false);
  const android = await shareQuestPayload({ userAgent: "Mozilla Android", share: async () => {} }, payload);
  assert.equal(android.confirmation, "handoff");
});

test("home wires completed-share bookkeeping with a synchronous reservation and distinct copy method", () => {
  const source = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function shareQuest(q"), source.indexOf("function askQuestion"));
  assert.match(handler, /await shareQuestAndRecord/);
  assert.match(handler, /shareCountReservationRef\.current\[q\.id\] = now \+ cooldownMs/);
  assert.ok(handler.indexOf("shareCountReservationRef.current[q.id] = now + cooldownMs") < handler.indexOf('supabase.from("quest_shares").insert'));
  assert.match(handler, /method === "clipboard" \? "copy_link" : "native_share"/);
  assert.match(handler, /shareCountReservationRef\.current\[q\.id\] = previousReservation/);
});
