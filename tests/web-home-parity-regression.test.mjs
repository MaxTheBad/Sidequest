import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

test("home preserves the current mobile search and view controls without legacy desktop reconciliation controls", () => {
  assert.match(source, /<section className="home119-discovery"[\s\S]*?<div className="home119-search-row">[\s\S]*?<div className="home119-search">[\s\S]*?<div className="home119-search-toggle"[\s\S]*?<div className="home119-chips"/);
  assert.doesNotMatch(source, /desktop-discovery-heading|desktop-people-discovery/);
  assert.match(source, /className="home119-section-actions"/);
  assert.match(source, /aria-label="Sort quests"/);
  assert.match(styles, /\.home119-sort-control/);
  assert.match(styles, /\.home119-result-pill/);
  assert.match(styles, /\.home119-discovery \{ width: 100%; max-width: 100%; box-sizing: border-box;/);
  assert.match(styles, /\.home119-find-people \{[\s\S]*?width: 100%;[\s\S]*?grid-template-columns: 42px minmax\(0,1fr\) 22px/);
});
test("theme initialization is explicitly hydration-safe", () => {
  assert.match(layout, /<html lang="en" suppressHydrationWarning>/);
  assert.match(layout, /document\.documentElement\.dataset\.theme = resolved/);
});
test("desktop home uses an isolated top-navigation, card-grid, and persistent map composition", () => {
  assert.match(source, /className="home119-desktop-header"/);
  assert.match(source, /className="home119-desktop-feed-layout"/);
  assert.match(source, /className="home119-desktop-map"/);
  assert.match(styles, /@media \(min-width: 768px\)[\s\S]*body:has\(\.home119-page\) \.desktop-rail \{ display: none !important; \}/);
  assert.match(styles, /\.home119-page \.feed119-list \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.home119-desktop-map \{ position: sticky/);
});

test("desktop cards reserve media space and separate host from location actions", () => {
  assert.match(source, /className="feed119-top-actions flex items-center gap-2"/);
  assert.match(styles, /\.home119-page \.feed119-card \.feed119-media \{ flex: 1 1 auto !important;/);
  assert.match(styles, /\.feed119-card \.feed119-top \{ display: grid; grid-template-columns: minmax\(0,1fr\) auto;/);
  assert.match(styles, /\.feed119-host \{[^}]*min-height: 44px;[^}]*background: rgba\(9,16,24,\.82\)/);
  assert.match(styles, /\.feed119-top-actions > \.relative > button \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(styles, /\.feed119-list \{ box-sizing: border-box; width: 100%;/);
});

test("web discovery expires by lifecycle end rather than start time", () => {
  assert.match(source, /status\.in\.\(open,full\)/);
  assert.match(source, /completed_at\.is\.null/);
  assert.match(source, /ends_at\.gt\.\$\{nowIso\}/);
  assert.match(source, /completed_at\.gte\.\$\{completedCutoffIso\}/);
  assert.match(source, /ends_at\.gte\.\$\{completedCutoffIso\}/);
  assert.match(source, /const isExpired = userId === q\.creator_id && hasQuestEnded\(q\)/);
  assert.doesNotMatch(source, /const isExpired = Boolean\(q\.starts_at/);
});
