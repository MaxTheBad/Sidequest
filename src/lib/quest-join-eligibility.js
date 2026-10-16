/** Client UX guard only. The database must independently enforce the same rule. */
/** @param {{ starts_at?: string|null, ends_at?: string|null, completed_at?: string|null, status?: string|null }|null|undefined} quest */
export function hasQuestEnded(quest, now = Date.now()) {
  if (!quest) return true;
  const status = String(quest.status || "open").toLowerCase();
  if (!["open", "full"].includes(status) || quest.completed_at) return true;
  // Start time is not an end time: in-progress quests remain eligible.
  const end = quest.ends_at;
  if (!end) return false;
  const time = Date.parse(end);
  return !Number.isFinite(time) || time <= now;
}

/** @param {{ starts_at?: string|null, ends_at?: string|null, completed_at?: string|null, status?: string|null }|null|undefined} quest */
export function isQuestClosedForJoining(quest, now = Date.now()) {
  return String(quest?.status || "open").toLowerCase() !== "open" || hasQuestEnded(quest, now);
}

export const QUEST_CLOSED_MESSAGE = "This quest has ended or is no longer accepting joins.";
