import test from 'node:test';
import assert from 'node:assert/strict';
import { createFollowUpStateLoader, parseFollowUpState } from '../src/lib/post-quest-followup.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as followUpHelpers from '../src/lib/post-quest-followup.js';

function followUpFixture(result, isHost = false) {
  const slots = [], effects = [];
  let index = 0;
  const hooks = {
    useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; },
    useRef(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useEffect(callback, deps) { const slot = index++; const previous = slots[slot]; if (!previous || !deps || deps.some((value, i) => value !== previous.deps[i])) { effects.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: callback() }; }); } },
  };
  const calls = [];
  const dependencies = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/lib/post-quest-followup': followUpHelpers,
    '@/lib/supabase': { getSupabaseClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return result; } }) },
  };
  const sandboxModule = { exports: {} };
  const source = readFileSync(new URL('../src/components/post-quest-followup.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: sandboxModule, exports: sandboxModule.exports, require: name => dependencies[name], process: { env: { NEXT_PUBLIC_POST_QUEST_FOLLOW_UPS: 'true' } }, window: { setInterval: () => 1, clearInterval() {} },
  });
  const props = { quest: { id: 'quest', creator_id: 'host', completed_at: '2026-10-17T01:00Z' }, userId: isHost ? 'host' : 'guest', approvedParticipant: true, isHost, members: [{ user_id: 'guest', status: 'approved' }], onLifecycleSaved() {} };
  function render() { index = 0; const tree = sandboxModule.exports.PostQuestFollowUp(props); effects.splice(0).forEach(effect => effect()); return tree; }
  function find(tree, text) { if (Array.isArray(tree)) return tree.map(node => find(node, text)).find(Boolean); if (!tree || typeof tree !== 'object') return undefined; return tree.type === 'button' && tree.props.children === text ? tree : find(tree.props.children, text); }
  return { calls, render, find, async settle() { await new Promise(resolve => setImmediate(resolve)); return render(); } };
}

test('saved false answers, optional null ratings and host false confirmations survive reload parsing', () => {
  assert.deepEqual(parseFollowUpState({ response: { went: false, private_rating: null }, attendance: [{ user_id: 'guest', attended: false }] }), { went: false, rating: null, attendance: { guest: false } });
  assert.deepEqual(parseFollowUpState({ response: null, attendance: [] }), { went: null, rating: null, attendance: {} });
  assert.equal(parseFollowUpState({ response: { went: true, private_rating: 5 }, attendance: [] }).rating, 5);
  for (const value of [null, {}, { response: { went: 'false', private_rating: null }, attendance: [] }, { response: { went: true, private_rating: 8 }, attendance: [] }]) assert.throws(() => parseFollowUpState(value));
});

test('reload ignores old actor/quest results, handles read errors and recovers on retry', async () => {
  const loader = createFollowUpStateLoader();
  const seen = [];
  const callbacks = { onBusy: value => seen.push(value), onSuccess: value => seen.push(value), onError: error => seen.push(error.message) };
  let resolve;
  const old = loader.load(() => new Promise(done => { resolve = done; }), callbacks);
  loader.invalidate();
  resolve({ data: { response: { went: false, private_rating: 3 }, attendance: [] } });
  await old;
  assert.deepEqual(seen, [true]);
  seen.length = 0;
  await loader.load(async () => ({ error: { message: 'permission denied' } }), callbacks);
  assert.deepEqual(seen, [true, 'permission denied', false]);
  seen.length = 0;
  await loader.load(async () => ({ data: { response: { went: false, private_rating: null }, attendance: [] } }), callbacks);
  assert.deepEqual(seen, [true, { went: false, rating: null, attendance: {} }, false]);
});

test('web controls load server answers before editing and attendance displays persisted confirmation', () => {
  const ui = readFileSync(new URL('../src/components/post-quest-followup.tsx', import.meta.url), 'utf8');
  assert.match(ui, /rpc\("read_quest_follow_up_state", \{ p_quest_id: quest.id \}\)/);
  assert.match(ui, /setWent\(saved.went\); setRating\(saved.rating\); setAttendance\(saved.attendance\)/);
  assert.match(ui, /disabled=\{busy \|\| loading \|\| !loaded \|\| went === null\}/);
  assert.match(ui, /aria-pressed=\{attendance\[member.user_id\] === false\}/);
  assert.match(ui, /loader.invalidate\(\); runner.invalidate\(\)/);
});

test('actual web component hydrates saved No/null and host Did not attend after a fresh mount', async () => {
  const result = { data: { response: { went: false, private_rating: null }, attendance: [{ user_id: 'guest', attended: false }] } };
  for (const host of [false, true]) {
    const fixture = followUpFixture(result, host);
    const initial = fixture.render();
    assert.equal(fixture.find(initial, 'No').props.disabled, true);
    const loaded = await fixture.settle();
    assert.equal(fixture.find(loaded, 'No').props['aria-pressed'], true);
    assert.equal(fixture.find(loaded, 'Yes').props['aria-pressed'], false);
    assert.equal(fixture.find(loaded, 'Save follow-up').props.disabled, false);
    if (host) assert.equal(fixture.find(loaded, 'Didn’t attend').props['aria-pressed'], true);
    assert.equal(fixture.calls[0].name, 'read_quest_follow_up_state');
    assert.equal(fixture.calls.length, 1, 'load must not save or generate notifications');
  }
});

test('actual web component fails closed on reader error and allows an explicit retry', async () => {
  const result = { error: { message: 'reader unavailable' } };
  const fixture = followUpFixture(result);
  fixture.render();
  const failed = await fixture.settle();
  assert.equal(fixture.find(failed, 'No').props.disabled, true);
  assert.ok(fixture.find(failed, 'Retry loading saved follow-up'));
  result.error = undefined;
  result.data = { response: { went: true, private_rating: 4 }, attendance: [] };
  fixture.find(failed, 'Retry loading saved follow-up').props.onClick();
  fixture.render();
  const retried = await fixture.settle();
  assert.equal(fixture.find(retried, 'Yes').props['aria-pressed'], true);
  assert.equal(fixture.find(retried, 4).props['aria-pressed'], true);
  assert.equal(fixture.find(retried, 'Save follow-up').props.disabled, false);
});
