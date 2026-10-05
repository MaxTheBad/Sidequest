import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadQuestAddress, updateDetailMembership } from '../src/lib/listing-detail.js';

test('exact address requires authentication and explicit participant access', () => {
  const base = { userId: 'viewer', isManager: false, visibility: 'approved_members', membershipStatus: 'pending', accessUserIds: [] };
  assert.equal(canReadQuestAddress(base), false);
  assert.equal(canReadQuestAddress({ ...base, membershipStatus: 'approved' }), false);
  assert.equal(canReadQuestAddress({ ...base, accessUserIds: ['viewer'] }), false);
  assert.equal(canReadQuestAddress({ ...base, membershipStatus: 'approved', accessUserIds: ['viewer'] }), true);
  assert.equal(canReadQuestAddress({ ...base, isManager: true }), true);
  assert.equal(canReadQuestAddress({ ...base, visibility: 'public' }), true);
  assert.equal(canReadQuestAddress({ ...base, userId: null, visibility: 'public', isManager: true }), false);
  assert.equal(canReadQuestAddress({ ...base, visibility: 'private', accessUserIds: ['viewer'] }), true);
});
function mockClient(approvalError, accessError) {
  const calls = [];
  const client = { from(table) { calls.push(table); return table === 'quest_members' ? {
    update(value) { calls.push(value); return this; }, eq() { return this; }, neq() { return Promise.resolve({ error: approvalError }); }
  } : { upsert(value) { calls.push(value); return Promise.resolve({ error: accessError }); } }; } };
  return { client, calls };
}
const input = { questId: 'quest', targetUserId: 'guest', userId: 'host', status: 'approved', shareAddress: true };
test('failed approval never grants address access', async () => {
  const { client, calls } = mockClient({ message: 'denied' });
  assert.deepEqual(await updateDetailMembership(client, input), { error: 'denied', approved: false, shared: false });
  assert.equal(calls.includes('quest_exact_location_access'), false);
});
test('ordinary approval preserves privacy; combined approval grants only the selected guest', async () => {
  const plain = mockClient(); await updateDetailMembership(plain.client, { ...input, shareAddress: false });
  assert.equal(plain.calls.includes('quest_exact_location_access'), false);
  const shared = mockClient(); assert.equal((await updateDetailMembership(shared.client, input)).shared, true);
  assert.deepEqual(shared.calls.at(-1), { quest_id: 'quest', user_id: 'guest', granted_by: 'host' });
});
test('partial grant failure is reported without pretending membership approval failed', async () => {
  const { client } = mockClient(null, { message: 'grant denied' });
  const result = await updateDetailMembership(client, input);
  assert.equal(result.approved, true); assert.equal(result.shared, false); assert.match(result.error, /not shared: grant denied/);
});
