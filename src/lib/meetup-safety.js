export function meetupSafetyKey(userId, context) {
  return `questhat_safety_prompt_hidden:${userId || 'anonymous'}:${context}`;
}
export function meetupSafetyHidden(storage, userId, context) {
  if (!userId) return false;
  try { return storage.getItem(meetupSafetyKey(userId, context)) === 'true'; }
  catch { return false; }
}
export function rememberMeetupSafety(storage, userId, context) {
  if (!userId) return false;
  try { storage.setItem(meetupSafetyKey(userId, context), 'true'); return true; }
  catch { return false; }
}
export function resetMeetupSafety(storage, userId) {
  if (!userId) return false;
  try { for (const context of ['host', 'guest']) storage.removeItem(meetupSafetyKey(userId, context)); return true; }
  catch { return false; }
}
