import test from "node:test";
import assert from "node:assert/strict";
// The distributed browser bundle mangles private method names; test its shipped SDK source hook.
import { PostHog } from "../node_modules/posthog-js/lib/src/posthog-core.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { privacySafeAnalyticsPath, scrubProductAnalyticsProperties } from "../src/lib/product-analytics.ts";
import { createCityUsageRecorder } from "../packages/shared/src/city-usage.ts";

function webProviderFixture(savedConsent) {
  const key = "questhat_optional_analytics";
  const values = new Map(savedConsent ? [[key, savedConsent]] : []);
  const calls = [], sent = [], effects = [];
  let failWrite = false, optedOut = true;
  const sdk = {
    config: {},
    init(token, config) { calls.push("init"); assert.equal(values.get(key), "granted"); sdk.config = config; },
    opt_in_capturing() { calls.push("opt_in"); optedOut = false; sdk.capture("$opt_in", { token: "public-fixture", consent: "granted" }); },
    opt_out_capturing() { calls.push("opt_out"); optedOut = true; },
    has_opted_out_capturing: () => optedOut,
    reset() { calls.push("reset"); optedOut = true; },
    identify(id) { calls.push("identify"); if (!optedOut) sent.push({ event: "$identify", id }); },
    capture(event, properties) { calls.push("capture"); if (!optedOut) { const clean = sdk.config.before_send({ event, properties }); if (clean) sent.push(clean); } },
  };
  const localStorage = { getItem: k => values.get(k) ?? null, setItem(k, value) { if (failWrite) throw new Error("storage blocked"); values.set(k, value); } };
  const sandboxModule = { exports: {} };
  const dependencies = {
    react: { useEffect: callback => effects.push(callback), useState: value => [value, () => {}], useSyncExternalStore: (_, getSnapshot) => getSnapshot() },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { usePathname: () => "/listing/private-quest" },
    "posthog-js": { __esModule: true, default: sdk },
    "posthog-js/react": { PostHogProvider: props => props.children },
    "@/lib/product-analytics": { privacySafeAnalyticsPath, scrubProductAnalyticsProperties },
    "@questhat/shared": { createCityUsageRecorder },
    "@/lib/supabase": { getSupabaseClient: () => null },
    "@/components/city-usage-preference": { __esModule: true, default: () => null },
  };
  const source = readFileSync(new URL("../src/components/posthog-provider.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports, require: name => { assert.ok(name in dependencies, `unexpected dependency ${name}`); return dependencies[name]; },
    process: { env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_public_fixture" } },
    window: { localStorage, location: { origin: "https://questhat.com" }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, Event,
  });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  function render() {
    const tree = expand(sandboxModule.exports.default({ children: "app" }));
    // Child effects can run first in React: pageviews must initialize only after a grant.
    effects.splice(0).reverse().forEach(callback => callback());
    return tree;
  }
  function findButton(tree, label) {
    if (Array.isArray(tree)) return tree.map(n => findButton(n, label)).find(Boolean);
    if (!tree || typeof tree !== "object") return undefined;
    return tree.type === "button" && tree.props.children === label ? tree : findButton(tree.props.children, label);
  }
  return { sdk, calls, sent, values, render, findButton, exports: sandboxModule.exports, failWrites() { failWrite = true; } };
}

test("web analytics never initializes or emits while unset/denied; consent buttons remain usable", () => {
  for (const saved of [undefined, "denied"]) {
    const fixture = webProviderFixture(saved);
    const tree = fixture.render();
    fixture.exports.captureProductEvent("quest_join_attempted", { platform: "web" });
    fixture.exports.identifyProductUser("consented-fixture");
    fixture.exports.resetProductUser();
    assert.equal(fixture.calls.length, 0, "SDK init/configuration requests must also wait for consent");
    assert.equal(fixture.sent.length, 0);
    if (!saved) {
      assert.ok(fixture.findButton(tree, "Allow analytics"));
      fixture.findButton(tree, "No thanks").props.onClick();
      assert.equal(fixture.values.get("questhat_optional_analytics"), "denied");
      assert.equal(fixture.calls.length, 0);
    }
  }
});

test("web grant initializes once, preserves opt-in controls, and withdrawal blocks late SDK events even if storage fails", () => {
  const fixture = webProviderFixture();
  const tree = fixture.render();
  fixture.exports.identifyProductUser("consented-fixture");
  fixture.findButton(tree, "Allow analytics").props.onClick();
  fixture.render();
  assert.equal(fixture.calls.filter(c => c === "init").length, 1);
  assert.equal(fixture.sdk.config.advanced_disable_flags, true);
  assert.equal(fixture.sdk.config.disable_external_dependency_loading, true);
  assert.equal(fixture.sent.find(e => e.event === "$opt_in").properties.consent, "granted");
  assert.ok(fixture.sent.some(e => e.event === "$pageview"));
  fixture.failWrites();
  fixture.findButton(tree, "No thanks").props.onClick();
  const sentBefore = fixture.sent.length;
  fixture.render();
  fixture.exports.captureProductEvent("quest_join_requested", { platform: "web" });
  fixture.exports.identifyProductUser("other-account");
  fixture.exports.resetProductUser();
  assert.equal(fixture.sent.length, sentBefore);
  assert.equal(fixture.sdk.config.before_send({ event: "late_event", properties: { token: "public-fixture" } }), null);
  assert.equal(fixture.calls.filter(c => c === "opt_in").length, 1, "a failed preference write cannot re-enable an old persisted grant");
});

test("installed PostHog capture suppresses queueing and transport while opted out", () => {
  const sdk = new PostHog();
  let requests = 0;
  sdk.__loaded = true;
  sdk.persistence = {};
  sdk.sessionPersistence = {};
  sdk._requestQueue = { enqueue: () => requests++ };
  sdk.consent = { isOptedOut: () => true, isOptedIn: () => false };
  sdk._send_request = () => requests++;
  assert.equal(sdk.is_capturing(), false);
  sdk.capture("quest_join_requested", { platform: "web" });
  assert.equal(requests, 0);
});

test("installed PostHog before_send hook scrubs SDK URLs, queries, campaign data and nested person properties", () => {
  const sdk = new PostHog();
  sdk.config.before_send = event => ({ ...event, properties: scrubProductAnalyticsProperties(event.properties) });
  const properties = {
    token: "public-fixture-key", distinct_id: "consented-fixture", platform: "web", surface: "listing", join_mode: "open",
    $current_url: "https://questhat.com/listing/private-quest?secret=yes#private", $pathname: "/listing/private-quest?secret=yes", page_path: "/inbox/private-thread?secret=yes",
    $session_entry_url: "https://questhat.com/listing/private-quest?secret=yes#private", $session_entry_pathname: "/listing/private-quest", $session_entry_utm_content: "private campaign", $initial_pathname: "/profile/private-person",
    $referrer: "https://example.invalid/private?secret=yes", utm_content: "private campaign",
    title: "private quest title", message: "private message", error: "private error", email: "private@example.invalid", latitude: 25,
    $set: { platform: "web", email: "private@example.invalid" },
    $set_once: { $initial_current_url: "https://questhat.com/profile/private-person?secret=yes", $initial_referrer: "https://example.invalid/?secret=yes", $initial_utm_content: "private campaign" },
  };
  const event = sdk._runBeforeSend({ event: "quest_join_requested", properties });
  assert.equal(event.properties.token, "public-fixture-key", "the SDK's required ingestion key must survive");
  assert.equal(event.properties.distinct_id, "consented-fixture");
  assert.equal(event.properties.$geoip_disable, true, "selected-city reports never depend on provider IP geolocation");
  assert.equal(event.properties.$current_url, "https://questhat.com/listing/[id]");
  assert.equal(event.properties.$pathname, "/listing/[id]");
  assert.equal(event.properties.$session_entry_url, "https://questhat.com/listing/[id]");
  assert.equal(event.properties.$session_entry_pathname, "/listing/[id]");
  assert.equal(event.properties.$initial_pathname, "/profile/[id]");
  assert.equal(event.properties.page_path, "/inbox/[id]");
  assert.equal(event.properties.$set_once.$initial_current_url, "https://questhat.com/profile/[id]");
  assert.equal(event.properties.$referrer, undefined);
  assert.equal(event.properties.$set_once.$initial_referrer, undefined);
  assert.doesNotMatch(JSON.stringify(event), /secret|private-quest|private-person|private-thread|private@example|private campaign|private message|private error|private quest title/);
  assert.equal(properties.email, "private@example.invalid", "scrubbing must not mutate the caller's object");
  const source = readFileSync(new URL("../src/components/posthog-provider.tsx", import.meta.url), "utf8");
  assert.match(source, /before_send:.*scrubProductAnalyticsProperties/);
  assert.match(source, /opt_out_capturing_by_default: true/);
  assert.match(source, /disable_session_recording: true/);
});

test("invalid URLs fail closed and account routes redact IDs without inventing a delivery signal", () => {
  assert.equal(privacySafeAnalyticsPath("/listing/private-quest/edit?secret=yes"), "/listing/[id]");
  assert.equal(privacySafeAnalyticsPath("/settings?secret=yes"), "/settings");
  const clean = scrubProductAnalyticsProperties({ $current_url: "malformed private URL", $initial_referrer: "javascript:private", confirmation: "handoff", outcome: "completed", method: "native" });
  assert.equal(clean.$current_url, undefined);
  assert.equal(clean.$initial_referrer, undefined);
  assert.equal(clean.confirmation, "handoff");
  assert.doesNotMatch(JSON.stringify(clean), /private/);
});
