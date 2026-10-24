import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { saveUserInterests } from '../src/lib/user-interests.js';
const id='44444444-4444-4444-8444-444444444444';
function fixture(failure) {
  const calls = [];
  const client = { from(table) { return {
    async upsert(rows, options) {
      calls.push(['upsert', table, rows, options]);
      return { error: failure === 'upsert' ? {message:'failed'} : null };
    },
    delete() {
      calls.push(['delete', table]);
      return { eq(key, value) {
        calls.push(['eq', key, value]);
        const result = {error: failure === 'delete' ? {message:'failed'} : null};
        return {
          not(...args) { calls.push(['not', ...args]); return Promise.resolve(result); },
          then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
        };
      } };
    },
  }; } };
  return {calls, client};
}
test('interest insert failure preserves previous interests',async()=>{const f=fixture('upsert');await assert.rejects(saveUserInterests(f.client,'user',[id]));assert.equal(f.calls.length,1);});
test('interest save deduplicates and limits removal to current account and deselections',async()=>{const f=fixture();await saveUserInterests(f.client,'user',[id,id]);assert.equal(f.calls[0][2].length,1);assert.deepEqual(f.calls[2],['eq','user_id','user']);assert.deepEqual(f.calls[3],['not','hobby_id','in',`(${id})`]);});
test('interest removal failure clearly reports partial save',async()=>{const f=fixture('delete');await assert.rejects(saveUserInterests(f.client,'user',[id]),/old interests could not be removed/);});
test('empty interests remove only current account rows; invalid values never reach backend',async()=>{const f=fixture();await saveUserInterests(f.client,'user',[]);assert.deepEqual(f.calls,[['delete','user_hobbies'],['eq','user_id','user']]);await assert.rejects(saveUserInterests(f.client,'user',['invalid']));assert.equal(f.calls.length,2);});

test('interest deselection cannot start until the selected rows have persisted', async () => {
  let resolveUpsert;
  const calls = [];
  const client = {
    from(table) {
      return {
        upsert(rows) {
          calls.push(["upsert", table, rows]);
          return new Promise((resolve) => { resolveUpsert = () => resolve({ error: null }); });
        },
        delete() {
          calls.push(["delete", table]);
          return { eq(key, value) { calls.push(["eq", key, value]); return { not() { calls.push(["not"]); return Promise.resolve({ error: null }); } }; } };
        },
      };
    },
  };
  const saving = saveUserInterests(client, "account-a", [id]);
  await Promise.resolve();
  assert.deepEqual(calls.map(([kind]) => kind), ["upsert"], "existing interests remain untouched while insert is in flight");
  resolveUpsert();
  await saving;
  assert.deepEqual(calls.map(([kind]) => kind), ["upsert", "delete", "eq", "not"]);
  assert.deepEqual(calls[2], ["eq", "user_id", "account-a"]);
});

test('pending save UI is bound to its originating account and mount', () => {
  const source=fs.readFileSync(new URL('../src/components/settings-interests.tsx',import.meta.url),'utf8');
  assert.match(source,/const saveUserId=userId;/);
  assert.match(source,/mountedRef\.current&&activeUserRef\.current===saveUserId&&saveGenerationRef\.current===saveGeneration/);
  assert.match(source,/if\(isCurrent\(\)\)setStatus\("Interests saved/);
  assert.match(source,/catch\(error\) \{if\(isCurrent\(\)\)setStatus/);
  assert.match(source,/finally \{if\(isCurrent\(\)\)\{savingRef\.current=false;setSaving\(false\);\}\}/);
  assert.match(source,/setIds\(\[\]\);setLoading\(true\)/);
  assert.match(source,/client\.auth\.getSession\(\)/);
  assert.match(source,/data\.session\?\.user\?\.id!==saveUserId/);
});

test('Settings page observes auth identity changes and invalidates stale loads', () => {
  const source=fs.readFileSync(new URL('../src/app/settings/page.tsx',import.meta.url),'utf8');
  assert.match(source,/supabase\.auth\.onAuthStateChange/);
  assert.match(source,/settingsLoadGenerationRef\.current \+= 1/);
  assert.match(source,/settingsAccountRef\.current = nextUserId/);
  assert.match(source,/clearAccountState\(\)/);
  assert.match(source,/function beginAccountOperation/);
  assert.match(source,/function isCurrentAccountOperation/);
  assert.match(source,/getValidatedSession/);
});
