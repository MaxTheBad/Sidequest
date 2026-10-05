import test from 'node:test';
import assert from 'node:assert/strict';
import { feedMembershipAction, feedCountdown } from '../src/lib/feed-card.js';

test('host state cannot expose a membership mutation, even with stale membership data', () => {
  const host = feedMembershipAction({ isOwner: true, status: 'pending', isJoined: true });
  assert.equal(host.label, 'Hosting');
  assert.equal(host.disabled, true);
  const expired = feedMembershipAction({ isOwner: true, isExpired: true });
  assert.equal(expired.label, 'Make again');
  assert.equal(expired.disabled, false);
});
test('non-host actions preserve approval, cancellation, retry and leave states', () => {
  for (const [input, label] of [
    [{}, 'Join now'], [{ joinMode: 'approval_required' }, 'Request to join'],
    [{ status: 'pending', isJoined: true }, 'Cancel request'],
    [{ status: 'declined' }, 'Request again'], [{ isJoined: true }, 'Leave quest'],
  ]) {
    const action = feedMembershipAction(input);
    assert.equal(action.label, label);
    assert.equal(action.disabled, false);
  }
});
test('countdown handles invalid, past, minute, hour and day boundaries', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  assert.equal(feedCountdown('invalid', now), null);
  assert.equal(feedCountdown(new Date(now).toISOString(), now), null);
  assert.equal(feedCountdown(new Date(now + 1).toISOString(), now), 'Starts in 1m');
  assert.equal(feedCountdown(new Date(now + 3660000).toISOString(), now), 'Starts in 1h 1m');
  assert.equal(feedCountdown(new Date(now + 90000000).toISOString(), now), 'Starts in 1d 1h');
});
