import test from 'node:test';
import assert from 'node:assert/strict';
import { cityMetricsForEvent, createCityUsageRecorder, normalizeUsageCity, parseCityPreference } from '../packages/shared/src/city-usage.ts';
import { membershipReviewProperties } from '../src/lib/product-analytics.ts';
import { scrubNativeDiagnosticEvent } from '../apps/mobile/src/lib/native-diagnostic-privacy.js';
import { optionalAnalyticsPayload } from '../apps/mobile/src/lib/optional-analytics-payload.js';

test('city is an explicit coarse label; addresses, coordinates, links and IDs are rejected', () => {
  assert.equal(normalizeUsageCity('  São Paulo, BR  '), 'São Paulo, BR');
  assert.equal(normalizeUsageCity('St. Louis, MO'), 'St. Louis, MO');
  for (const value of ['123 Main Street', 'Main Street', '25.7617,-80.1918', 'https://example.com', 'a@b.com', '', 'A'.repeat(81)]) assert.equal(normalizeUsageCity(value), null);
  assert.deepEqual(parseCityPreference({ enabled: true, selected_city: '123 Main Street' }), { enabled: false, selected_city: null });
});

test('city metrics contain only fixed kinds, never event payloads or geographic guesses', () => {
  const properties = { decision: 'approved', first_approved_guest: true, approval_wait_bucket: '5_30m', city: 'secret', latitude: 25, user_id: 'secret' };
  assert.deepEqual(cityMetricsForEvent('quest_join_reviewed', properties), ['join_approved', 'first_approved_guest', 'approval_wait_5_30m']);
  assert.deepEqual(cityMetricsForEvent('quest_join_reviewed', { ...properties, decision: 'declined' }), ['join_declined']);
  assert.deepEqual(cityMetricsForEvent('message_sent', properties), []);
});

test('no city RPC while locally denied, missing actor, absent server choice or RPC error', async () => {
  const calls = [];
  const recorder = createCityUsageRecorder(() => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: { enabled: false } }; } }));
  await recorder.configure('qa-a', false);
  await recorder.configure(null, true);
  assert.equal(calls.length, 0);
  assert.equal(recorder.capture('quest_created'), false);
  await recorder.configure('qa-a', true);
  assert.equal(recorder.capture('quest_created'), false);
  assert.equal(calls.length, 1);
  const broken = createCityUsageRecorder(() => ({ rpc: async () => { throw Error('offline'); } }));
  await broken.configure('qa-a', true);
  assert.equal(broken.capture('quest_created'), false);
});

test('withdrawal/account switch cancels stale preference responses and queued events', async () => {
  let resolvePreference;
  const calls = [];
  const recorder = createCityUsageRecorder(() => ({ rpc: (name, args) => {
    calls.push({ name, args });
    if (name === 'my_city_usage_preference') return new Promise(resolve => { resolvePreference = resolve; });
    return Promise.resolve({ data: true });
  } }));
  const pending = recorder.configure('qa-a', true);
  recorder.clear();
  resolvePreference({ data: { enabled: true, selected_city: 'Miami, FL' } });
  await pending;
  assert.equal(recorder.capture('quest_created'), false);
  const ready = recorder.configure('qa-b', true);
  resolvePreference({ data: { enabled: true, selected_city: 'Miami, FL' } });
  await ready;
  assert.equal(recorder.capture('quest_created', { city: 'ignored', address: 'ignored' }), true);
  recorder.clear();
  await Promise.resolve();
  assert.equal(calls.filter(call => call.name === 'record_city_usage').length, 0);
});

test('opted-in contribution sends actor and kind only; no city/content/device/IP in event RPC', async () => {
  const calls = [];
  const recorder = createCityUsageRecorder(() => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'my_city_usage_preference' ? { enabled: true, selected_city: 'Miami, FL' } : true }; } }));
  await recorder.configure('qa-a', true);
  recorder.capture('quest_join_requested', { address: 'private', city: 'private', query: 'private' });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls.at(-1), { name: 'record_city_usage', args: { p_actor_id: 'qa-a', p_metric: 'quest_join_requested' } });
});

test('confirmed web review properties are coarse and first guest applies only to approvals', () => {
  assert.deepEqual(membershipReviewProperties({ decision: 'approved', requestedAt: '2026-10-17T01:00Z', reviewedAt: '2026-10-17T01:08Z', firstApprovedGuest: true }), { platform: 'web', decision: 'approved', approval_wait_bucket: '5_30m', first_approved_guest: true });
  assert.equal(membershipReviewProperties({ decision: 'declined', reviewedAt: new Date().toISOString(), firstApprovedGuest: true }).first_approved_guest, false);
});

test('native diagnostic errors retain readable code frames, not identity/content or request secrets', () => {
  const clean = scrubNativeDiagnosticEvent({ user: { id: 'private-account', email: 'private@example.com' }, message: 'private message', request: { url: 'https://questhat.com/listing/private-quest?token=private', headers: { authorization: 'private' }, data: 'private' }, breadcrumbs: [{ category: 'console', message: 'private' }, { category: 'navigation', data: { address: 'private' }, message: 'private' }], exception: { values: [{ type: 'Error', value: 'private', stacktrace: { frames: [{ filename: 'App.tsx', function: 'render', lineno: 42, vars: { address: 'private' } }] } }] }, extra: { address: 'private' } });
  assert.doesNotMatch(JSON.stringify(clean), /private/);
  assert.equal(clean.request.url, 'https://questhat.com/listing/[id]');
  assert.equal(clean.exception.values[0].stacktrace.frames[0].filename, 'App.tsx');
  assert.equal(clean.exception.values[0].stacktrace.frames[0].lineno, 42);
});

test('native usage payload has fixed coarse values and explicitly disables IP geolocation', () => {
  const safe = optionalAnalyticsPayload({ platform: 'ios', decision: 'approved', first_approved_guest: true, approval_wait_bucket: 'under_5m', category: 'private custom text', city: 'private', address: 'private', user_id: 'private', screen: 'private' });
  assert.deepEqual(safe, { $geoip_disable: true, platform: 'ios', decision: 'approved', approval_wait_bucket: 'under_5m', first_approved_guest: true });
  assert.doesNotMatch(JSON.stringify(safe), /private/);
});
