import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
const webSource = readFileSync(new URL("../src/components/posthog-provider.tsx", import.meta.url), "utf8");
const webSentryPrivacy = readFileSync(new URL("../src/lib/sentry-privacy.ts", import.meta.url), "utf8");
const webSentryClient = readFileSync(new URL("../src/instrumentation-client.ts", import.meta.url), "utf8");

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
  assert.match(appSource, /const createPosthogClient = \(\) => env\.posthogKey/);
  assert.match(appSource, /const optionalAnalytics = createOptionalAnalytics\(createPosthogClient\)/);
  assert.match(appSource, /captureAppLifecycleEvents:\s*false/);
  assert.match(appSource, /preloadFeatureFlags:\s*false/);
  assert.match(appSource, /await optionalAnalytics\.disable\(\);/);
  assert.match(appSource, /optionalAnalytics\.capture\("screen_viewed"/);
  assert.doesNotMatch(appSource, /posthogClient\?\.capture\(/);
  assert.match(webSource, /optionalAnalyticsEnabled/);
  assert.match(webSource, /posthogKey && optionalAnalyticsEnabled/);
  assert.match(webSource, /posthog\.reset\(\);/);
});

test("web Sentry excludes user payloads and session replay", () => {
  assert.match(webSentryClient, /NEXT_PUBLIC_SENTRY_DSN/);
  assert.match(webSentryPrivacy, /sendDefaultPii:\s*false/);
  assert.match(webSentryPrivacy, /userInfo:\s*false/);
  assert.match(webSentryPrivacy, /cookies:\s*false/);
  assert.match(webSentryPrivacy, /httpHeaders:\s*false/);
  assert.match(webSentryPrivacy, /httpBodies:\s*\[\]/);
  assert.match(webSentryPrivacy, /urlQueryParams:\s*false/);
  assert.match(webSentryPrivacy, /databaseQueryData:\s*false/);
  assert.match(webSentryPrivacy, /stackFrameVariables:\s*false/);
  assert.match(webSentryPrivacy, /replaysSessionSampleRate:\s*0/);
  assert.match(webSentryPrivacy, /replaysOnErrorSampleRate:\s*0/);
  assert.match(webSentryPrivacy, /message:\s*undefined/);
  assert.match(webSentryPrivacy, /query_string:\s*undefined/);
  assert.match(webSentryPrivacy, /extra:\s*undefined/);
  assert.doesNotMatch(webSentryClient, /replayIntegration/);
  const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(nextConfig, /NEXT_PUBLIC_SENTRY_RELEASE: process\.env\.CF_PAGES_COMMIT_SHA \|\| process\.env\.SENTRY_RELEASE/);
});
