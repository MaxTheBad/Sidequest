/** Keep detail privacy identical to the native membership/access rules. */
export function canReadQuestAddress({ userId, isManager, visibility, membershipStatus, accessUserIds }) {
  if (!userId) return false;
  if (isManager || visibility === 'public') return true;
  if (visibility === 'approved_members') return membershipStatus === 'approved' && accessUserIds.includes(userId);
  return accessUserIds.includes(userId);
}

/** Grant exact-address access only after membership approval succeeds. */
export async function updateDetailMembership(client, { questId, targetUserId, userId, status, shareAddress }) {
  const { error } = await client.from('quest_members').update({ status })
    .eq('quest_id', questId).eq('user_id', targetUserId).neq('role', 'creator');
  if (error) return { error: error.message, approved: false, shared: false };
  if (shareAddress && status === 'approved') {
    const { error: accessError } = await client.from('quest_exact_location_access')
      .upsert({ quest_id: questId, user_id: targetUserId, granted_by: userId });
    if (accessError) return { error: `Member approved, but exact address was not shared: ${accessError.message}`, approved: true, shared: false };
    return { error: null, approved: true, shared: true };
  }
  return { error: null, approved: status === 'approved', shared: false };
}
