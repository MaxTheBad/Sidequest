/** Client UX guard only. The database must independently enforce the same rule. */
/** @param {{ starts_at?: string|null, ends_at?: string|null, completed_at?: string|null, status?: string|null }|null|undefined} quest */
export function hasQuestEnded(quest, now = Date.now()) {
  if (!quest) return true;
  const status = String(quest.status || "open").toLowerCase();
  if (!["open", "full"].includes(status) || quest.completed_at) return true;
  const startTime = quest.starts_at ? Date.parse(quest.starts_at) : Number.NaN;
  if (Number.isFinite(startTime) && startTime <= now) return true;
  const endTime = quest.ends_at ? Date.parse(quest.ends_at) : Number.NaN;
  return Number.isFinite(endTime) && endTime <= now;
}

/** @param {{ starts_at?: string|null, ends_at?: string|null, completed_at?: string|null, status?: string|null }|null|undefined} quest */
export function isQuestClosedForJoining(quest, now = Date.now()) {
  return String(quest?.status || "open").toLowerCase() !== "open" || hasQuestEnded(quest, now);
}

/** Returns the next time an otherwise-open quest must be re-evaluated for joining. */
/** @param {{ starts_at?: string|null, ends_at?: string|null, completed_at?: string|null, status?: string|null }|null|undefined} quest */
export function nextQuestJoinBoundary(quest, now = Date.now()) {
  if (!quest || quest.completed_at || String(quest.status || "open").toLowerCase() !== "open") return null;
  const candidates = [quest.starts_at, quest.ends_at]
    .map(value => value ? Date.parse(value) : Number.NaN)
    .filter(value => Number.isFinite(value) && value > now);
  return candidates.length ? Math.min(...candidates) : null;
}

export const QUEST_CLOSED_MESSAGE = "This quest has ended or is no longer accepting joins.";
