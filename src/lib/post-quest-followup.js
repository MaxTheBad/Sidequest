const CANCELED = new Set(["cancelled", "canceled"]);

function validTime(value) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

// A start time is deliberately not evidence that a quest ended. A follow-up can
// appear only after the host records completion or after the explicitly stored
// end time has passed. Rescheduling changes endsAt and therefore suppresses an
// old prompt automatically.
export function getFollowUpEligibility({ quest, userId, approvedParticipant, isHost, now = Date.now() }) {
  if (!userId || (!approvedParticipant && !isHost)) return { eligible: false, reason: "not-authorized" };
  if (CANCELED.has(String(quest?.status || "").toLowerCase())) return { eligible: false, reason: "cancelled" };
  const completedAt = validTime(quest?.completed_at);
  const endsAt = validTime(quest?.ends_at);
  if (!completedAt && !endsAt) return { eligible: false, reason: "no-end-basis" };
  if (!completedAt && endsAt > now) return { eligible: false, reason: "not-ended" };
  return { eligible: true, canConfirmAttendance: Boolean(isHost), canRate: Boolean(approvedParticipant || isHost) };
}

export function attendanceState({ attendeeWent, hostConfirmedAttendance }) {
  if (attendeeWent === undefined || hostConfirmedAttendance === undefined) return "unknown";
  return attendeeWent === hostConfirmedAttendance ? "confirmed" : "disputed";
}

export function followUpPayload({ questId, went, rating }) {
  if (!questId) throw new Error("Quest is required.");
  if (went !== true && went !== false) throw new Error("Choose whether you went.");
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Rating must be between 1 and 5.");
  return { p_quest_id: questId, p_went: went, p_rating: rating ?? null };
}

export function parseFollowUpState(value) {
  if (!value || typeof value !== "object" || !("response" in value) || !Array.isArray(value.attendance)) throw new Error("Could not load saved follow-up.");
  const response = value.response;
  if (response !== null && (typeof response !== "object" || ![true, false, null].includes(response.went)
    || (response.private_rating !== null && (!Number.isInteger(response.private_rating) || response.private_rating < 1 || response.private_rating > 5)))) throw new Error("Could not load saved follow-up.");
  const attendance = {};
  for (const row of value.attendance) {
    if (!row || typeof row.user_id !== "string" || typeof row.attended !== "boolean") throw new Error("Could not load saved attendance.");
    attendance[row.user_id] = row.attended;
  }
  return { went: response?.went ?? null, rating: response?.private_rating ?? null, attendance };
}

/** New loads invalidate old ones; late responses never replace another actor/quest. */
export function createFollowUpStateLoader() {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async load(request, { onSuccess, onError, onBusy }) {
      const ticket = ++generation;
      onBusy(true);
      try {
        const result = await request();
        if (result.error) throw result.error;
        const saved = parseFollowUpState(result.data);
        if (ticket === generation) onSuccess(saved);
      } catch (error) { if (ticket === generation) onError(error); }
      finally { if (ticket === generation) onBusy(false); }
    },
  };
}

export function questLifecyclePayload({ quest, userId, endsAt, markCompleted = false, now = Date.now() }) {
  if (!userId || quest?.creator_id !== userId) throw new Error("Only the host can update the quest lifecycle.");
  if (CANCELED.has(String(quest.status || "").toLowerCase())) throw new Error("Cancelled quests cannot be completed.");
  const end = validTime(endsAt);
  const start = validTime(quest.starts_at);
  if (end === null || (start !== null && end < start)) throw new Error("End time must be at or after the start time.");
  if (markCompleted && end > now) throw new Error("A future end time cannot be marked complete.");
  return { p_quest_id: quest.id, p_ends_at: new Date(end).toISOString(), p_mark_completed: markCompleted };
}

/** Serialize writes and discard completion callbacks after navigation/account changes. */
export function createFollowUpActionRunner() {
  let pending = false;
  let generation = 0;
  return {
    invalidate() { generation += 1; pending = false; },
    async run(request, { onBusy, onSuccess, onError }) {
      if (pending) return false;
      pending = true;
      const ticket = generation;
      onBusy(true);
      try {
        const result = await request();
        if (result.error) throw result.error;
        if (ticket === generation) onSuccess(result.data);
      } catch (error) {
        if (ticket === generation) onError(error);
      } finally {
        if (ticket === generation) { pending = false; onBusy(false); }
      }
      return true;
    },
  };
}
