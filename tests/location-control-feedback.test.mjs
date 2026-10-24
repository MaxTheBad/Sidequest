import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getLocationControlCopy } from "../src/lib/location-control.ts";

const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/lib/location-control.ts", import.meta.url), "utf8");
const map = await readFile(new URL("../src/components/quest-map.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("location control distinguishes pending, denied, unavailable and ready outcomes", () => {
  assert.match(helper, /status === "loading"[\s\S]*label: "Locating…"/);
  assert.match(helper, /status === "denied" \|\| permission === "denied"[\s\S]*label: "Location blocked"/);
  assert.match(helper, /status === "error"[\s\S]*label: "Try locating again"/);
  assert.match(helper, /status === "ready"[\s\S]*"Approximate location"[\s\S]*"My location"/);
  assert.match(helper, /source === "stored"[\s\S]*label: "Saved location"[\s\S]*Browser location is blocked/);
});

test("a denied refresh describes the saved origin instead of claiming it is current", () => {
  assert.deepEqual(getLocationControlCopy("denied", "denied", false, "stored"), {
    label: "Saved location",
    message: "Using a saved location for distances. Browser location is blocked, so it cannot be refreshed.",
  });
  assert.deepEqual(getLocationControlCopy("ready", "granted", false, "fresh"), {
    label: "My location",
    message: "Using your location to calculate quest distances.",
  });
});

test("list and map surfaces explain location results without relying on a prompt", () => {
  assert.match(page, /const locationControlCopy = getLocationControlCopy\(/);
  assert.equal((page.match(/locationLabel=\{locationControlCopy\.label\}/g) || []).length, 2);
  assert.equal((page.match(/role="status" aria-live="polite">\{locationControlCopy\.message\}/g) || []).length, 3);
  assert.match(page, /home119-location-status-list/);
  assert.equal((page.match(/locating=\{userLocationStatus === "loading"\}/g) || []).length, 2);
  assert.match(map, /disabled=\{locating\}/);
});

test("each responsive composition exposes one location live region", () => {
  assert.match(page, /feedViewMode === "list" && userLocationStatus !== "idle"[^\n]*home119-location-status-list/);
  assert.match(css, /@media \(min-width: 1280px\) \{ \.home119-location-status-list \{ display: none; \} \}/);
  assert.equal((page.match(/home119-location-status home119-location-status-list/g) || []).length, 1, "mobile and intermediate List share one global status");
  assert.equal((page.match(/<aside className="home119-desktop-map"[\s\S]*?role="status" aria-live="polite"/g) || []).length, 1, "desktop List uses the sidebar status after hiding the global one");
  assert.equal((page.match(/<p className="home119-location-status" role="status" aria-live="polite">/g) || []).length, 2, "desktop List and Map each own one composition-specific status");
});

test("card action names its distance outcome", () => {
  assert.match(page, /aria-label=[^\n]*"Show distance — use your location to calculate distance"/);
  assert.match(page, /title=[^\n]*"Use your location to calculate distance"/);
  assert.match(page, /<strong>\{[^\n]*"Show distance"/);
  assert.doesNotMatch(page, />Use my location</);
});
