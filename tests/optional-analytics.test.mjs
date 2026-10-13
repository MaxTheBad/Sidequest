import test from "node:test";
import assert from "node:assert/strict";
import { createOptionalAnalytics } from "../apps/mobile/src/lib/optional-analytics.js";

test("optional analytics fail closed and stop before preference persistence", async () => {
  const calls = [];
  const analytics = createOptionalAnalytics({
    optIn: async () => calls.push("optIn"),
    optOut: async () => calls.push("optOut"),
    reset: async () => calls.push("reset"),
    capture: () => calls.push("capture"),
    identify: () => calls.push("identify"),
  });

  assert.equal(analytics.capture("screen_viewed"), false);
  assert.equal(analytics.identify("account"), false);
  await analytics.disable();
  assert.deepEqual(calls, ["optOut", "reset"]);
});

test("optional analytics emits and identifies only after explicit enable, then resets on account changes", async () => {
  const calls = [];
  const analytics = createOptionalAnalytics({
    optIn: async () => calls.push("optIn"),
    capture: () => calls.push("capture"),
    identify: () => calls.push("identify"),
    reset: () => calls.push("reset"),
  });

  await analytics.enable();
  assert.equal(analytics.capture("screen_viewed"), true);
  assert.equal(analytics.identify("account", { platform: "ios" }), true);
  analytics.reset();
  assert.deepEqual(calls, ["optIn", "capture", "identify", "reset"]);
});

test("consent withdrawal stops later capture and identity after an account switch", async () => {
  const calls = [];
  const analytics = createOptionalAnalytics({
    optIn: async () => calls.push("optIn"),
    optOut: async () => calls.push("optOut"),
    reset: async () => calls.push("reset"),
    capture: (name) => calls.push(`capture:${name}`),
    identify: (id) => calls.push(`identify:${id}`),
  });
  await analytics.enable();
  assert.equal(analytics.identify("account-a"), true);
  analytics.reset();
  assert.equal(analytics.identify("account-b"), true, "reset clears the prior identity while retaining the explicit device preference");
  await analytics.disable();
  assert.equal(analytics.capture("screen_viewed"), false);
  assert.equal(analytics.identify("account-c"), false);
  assert.deepEqual(calls, ["optIn", "identify:account-a", "reset", "identify:account-b", "optOut", "reset"]);
});
