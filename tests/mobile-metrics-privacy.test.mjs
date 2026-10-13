import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoveryLoadedProperties, joinReviewedProperties, minutesBucket, resultBucket } from "../apps/mobile/src/lib/metrics-privacy.ts";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");

test("native metrics use coarse discovery and approval-review properties", () => {
  assert.deepEqual([resultBucket(0), resultBucket(1), resultBucket(6), resultBucket(21)], ["empty", "1_5", "6_20", "21_plus"]);
  assert.equal(minutesBucket("2026-10-11T00:00:00Z", "2026-10-11T00:31:00Z"), "30m_2h");
  assert.match(appSource, /optionalAnalytics\.capture\("discovery_loaded"/);
  assert.match(appSource, /optionalAnalytics\.capture\("quest_join_reviewed"/);
  assert.match(appSource, /discoveryLoadedProperties\(/);
  assert.match(appSource, /joinReviewedProperties\(/);
});

test("native dashboard helpers emit only the approved coarse schemas", () => {
  assert.deepEqual(
    discoveryLoadedProperties({ platform: "ios", resultCount: 6, queryActive: true, categoryFilterActive: false }),
    { platform: "ios", result_bucket: "6_20", query_active: true, category_filter_active: false },
  );
  assert.deepEqual(
    joinReviewedProperties({ platform: "ios", decision: "approved", requestedAt: "2026-10-11T00:00:00Z", reviewedAt: "2026-10-11T00:31:00Z", firstApprovedGuest: true }),
    { platform: "ios", decision: "approved", approval_wait_bucket: "30m_2h", first_approved_guest: true },
  );
});

test("native metrics do not add city, quest, user, address, or search-text properties", () => {
  const metricSection = appSource.slice(appSource.indexOf('optionalAnalytics.capture("discovery_loaded"'), appSource.indexOf("void loadQuestCardCounts", appSource.indexOf('optionalAnalytics.capture("discovery_loaded"')));
  const reviewSection = appSource.slice(appSource.indexOf('optionalAnalytics.capture("quest_join_reviewed"'), appSource.indexOf("setStatus(", appSource.indexOf('optionalAnalytics.capture("quest_join_reviewed"')));
  for (const sensitiveName of ["city", "quest_id", "user_id", "address", "search_query"]) {
    assert.doesNotMatch(metricSection, new RegExp(`${sensitiveName}:`));
    assert.doesNotMatch(reviewSection, new RegExp(`${sensitiveName}:`));
  }
});
