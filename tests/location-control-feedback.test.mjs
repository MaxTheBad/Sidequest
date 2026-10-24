import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/lib/location-control.ts", import.meta.url), "utf8");

test("location control distinguishes pending, denied, unavailable and ready outcomes", () => {
  assert.match(helper, /status === "loading"[\s\S]*label: "Locating…"/);
  assert.match(helper, /status === "denied" \|\| permission === "denied"[\s\S]*label: "Location blocked"/);
  assert.match(helper, /status === "error"[\s\S]*label: "Try locating again"/);
  assert.match(helper, /status === "ready"[\s\S]*"Approximate location"[\s\S]*"My location"/);
});

test("list and map surfaces explain location results without relying on a prompt", () => {
  assert.match(page, /const locationControlCopy = getLocationControlCopy\(/);
  assert.equal((page.match(/locationLabel=\{locationControlCopy\.label\}/g) || []).length, 2);
  assert.equal((page.match(/role="status" aria-live="polite">\{locationControlCopy\.message\}/g) || []).length, 2);
});

test("card action names its distance outcome", () => {
  assert.match(page, /aria-label=[^\n]*"Show distance — use your location to calculate distance"/);
  assert.match(page, /title=[^\n]*"Use your location to calculate distance"/);
  assert.match(page, /<strong>\{[^\n]*"Show distance"/);
  assert.doesNotMatch(page, />Use my location</);
});
