import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
const webSource = readFileSync(new URL("../src/components/posthog-provider.tsx", import.meta.url), "utf8");

test("native diagnostics strip sensitive event data and explicitly disable replay", () => {
  assert.match(appSource, /sendDefaultPii:\s*false/);
  assert.match(appSource, /replaysSessionSampleRate:\s*0/);
  assert.match(appSource, /replaysOnErrorSampleRate:\s*0/);
  assert.match(appSource, /beforeSend:\s*scrubSentryEvent/);
  assert.match(appSource, /beforeBreadcrumb:\s*scrubSentryBreadcrumb/);
  assert.match(appSource, /extra:\s*undefined/);
  assert.match(appSource, /query_string:\s*undefined/);
});

test("product analytics calls use the consent gate on web and native", () => {
  assert.match(appSource, /const optionalAnalytics = createOptionalAnalytics\(posthogClient\)/);
  assert.match(appSource, /await optionalAnalytics\.disable\(\);/);
  assert.match(appSource, /optionalAnalytics\.capture\("screen_viewed"/);
  assert.doesNotMatch(appSource, /posthogClient\?\.capture\(/);
  assert.match(webSource, /optionalAnalyticsEnabled/);
  assert.match(webSource, /posthogKey && optionalAnalyticsEnabled/);
  assert.match(webSource, /posthog\.reset\(\);/);
});
