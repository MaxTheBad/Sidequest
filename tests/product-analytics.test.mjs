import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnalyticsFailure, minutesBucket, resultBucket } from "../src/lib/product-analytics.ts";

test("analytics uses only coarse result and duration buckets", () => {
  assert.deepEqual([resultBucket(0), resultBucket(1), resultBucket(6), resultBucket(21)], ["empty", "1_5", "6_20", "21_plus"]);
  assert.equal(minutesBucket("2026-10-11T00:00:00Z", "2026-10-11T00:31:00Z"), "30m_2h");
  assert.equal(minutesBucket(null, "2026-10-11T00:31:00Z"), null);
});

test("analytics failure categories never retain server error text", () => {
  assert.equal(classifyAnalyticsFailure(new Error("rate limit: retry")), "rate_limited");
  assert.equal(classifyAnalyticsFailure(new Error("secret address leaked")), "unknown");
});
