export function beginQuestEditorDraftSession(existingSession, userId, questId, createDraft) {
  if (!userId || !questId) return null;
  if (existingSession?.userId === userId) {
    return { ...existingSession, questId };
  }
  return { userId, questId, createDraft };
}

export function consumeQuestEditorDraftSession(session, currentUserId) {
  return {
    draft: session?.userId === currentUserId ? session.createDraft : null,
    session: null,
  };
}
