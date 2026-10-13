const CANCELED = new Set(["cancelled", "canceled"]);

function validTime(value) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

export function getFollowUpEligibility({ quest, userId, approvedParticipant, isHost, now = Date.now() }) {
  if (!userId || (!approvedParticipant && !isHost)) return { eligible: false, reason: "not-authorized" };
  if (CANCELED.has(String(quest?.status || "").toLowerCase())) return { eligible: false, reason: "cancelled" };
  const completedAt = validTime(quest?.completed_at);
  const endsAt = validTime(quest?.ends_at);
  if (!completedAt && !endsAt) return { eligible: false, reason: "no-end-basis" };
  if (!completedAt && endsAt > now) return { eligible: false, reason: "not-ended" };
  return { eligible: true, canConfirmAttendance: Boolean(isHost), canRate: Boolean(approvedParticipant || isHost) };
}

export function followUpPayload({ questId, went, rating }) {
  if (!questId) throw new Error("Quest is required.");
  if (went !== true && went !== false) throw new Error("Choose whether you went.");
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Rating must be between 1 and 5.");
  return { p_quest_id: questId, p_went: went, p_rating: rating ?? null };
}
