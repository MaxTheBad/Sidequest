import test from "node:test";
import assert from "node:assert/strict";
import { buildQuestSharePayload } from "../apps/mobile/src/lib/native-quest-intents.js";

const quest = {
  id: "3f627f0a-859d-4ee1-922b-89afefdceee7",
  title: "QA analytics verification — no real meetup",
  description: "Temporary authorized QuestHat analytics verification. Do not join.",
};
const canonicalUrl = `https://questhat.com/listing/${quest.id}`;

test("iOS Copy and AirDrop content is canonical URL-only while email keeps a subject", () => {
  const payload = buildQuestSharePayload(quest, "https://questhat.com/", "ios");
  assert.deepEqual(payload.content, { url: canonicalUrl });
  assert.deepEqual(payload.options, { subject: quest.title });
  assert.equal(payload.url, canonicalUrl);
  assert.doesNotMatch(JSON.stringify(payload.content), /QA analytics|Temporary authorized/);
});

test("Android share content contains only the canonical URL plus a chooser title", () => {
  const payload = buildQuestSharePayload(quest, "https://questhat.com", "android");
  assert.deepEqual(payload.content, { message: canonicalUrl });
  assert.deepEqual(payload.options, { dialogTitle: "Share QuestHat listing" });
  assert.equal(payload.url, canonicalUrl);
  assert.doesNotMatch(payload.content.message, /QA analytics|Temporary authorized/);
});

test("listing identifiers are encoded before sharing", () => {
  const payload = buildQuestSharePayload({ ...quest, id: "unsafe/id?join=1" }, "https://questhat.com", "ios");
  assert.equal(payload.url, "https://questhat.com/listing/unsafe%2Fid%3Fjoin%3D1");
});
