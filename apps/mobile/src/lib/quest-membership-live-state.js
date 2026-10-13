export function shouldRefreshQuestMembershipFromPayload(payload, questId) {
  if (!payload || !questId) return false;
  const changedQuestId = payload.new?.quest_id || payload.old?.quest_id || null;
  if (changedQuestId) return changedQuestId === questId;
  return payload.eventType === "DELETE";
}
