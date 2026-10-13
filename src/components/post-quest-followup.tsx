"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { followUpPayload, getFollowUpEligibility } from "@/lib/post-quest-followup";

// This remains false in current deployments. Enable only after the companion
// migration and RPCs are applied and approved.
const FOLLOW_UPS_ENABLED = process.env.NEXT_PUBLIC_POST_QUEST_FOLLOW_UPS === "true";

type Quest = { id: string; status?: string | null; starts_at?: string | null; ends_at?: string | null; completed_at?: string | null };
type Member = { user_id: string; status?: string | null; profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null };

export function PostQuestFollowUp({ quest, userId, approvedParticipant, isHost, members }: { quest: Quest; userId: string | null; approvedParticipant: boolean; isHost: boolean; members: Member[] }) {
  const [went, setWent] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!FOLLOW_UPS_ENABLED) return null;
  const eligibility = getFollowUpEligibility({ quest, userId, approvedParticipant, isHost });
  if (!eligibility.eligible) return null;

  async function submit() {
    if (!userId || went === null) return setMessage("Choose whether you went.");
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage("Follow-ups are unavailable right now.");
    setBusy(true);
    const { error } = await supabase.rpc("submit_quest_follow_up", followUpPayload({ questId: quest.id, went, rating }));
    setBusy(false);
    setMessage(error ? error.message : "Your private follow-up was saved.");
  }

  async function confirmAttendance(memberId: string, attended: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage("Follow-ups are unavailable right now.");
    setBusy(true);
    const { error } = await supabase.rpc("confirm_quest_attendance", { p_quest_id: quest.id, p_user_id: memberId, p_attended: attended });
    setBusy(false);
    setMessage(error ? error.message : "Attendance confirmation saved. Conflicts remain disputed.");
  }

  const attendees = members.filter((member) => member.status === "approved" && member.user_id !== userId);
  return <section className="detail119-section" aria-labelledby="post-quest-follow-up-title">
    <h2 id="post-quest-follow-up-title">After the quest</h2>
    <p className="text-sm text-slate-600">Your response is private. Different attendee and host responses are shown as disputed, not treated as a no-show.</p>
    <div className="mt-3 flex flex-wrap gap-2"><span className="text-sm font-semibold">Did you go?</span>
      <button type="button" className="detail119-review" aria-pressed={went === true} onClick={() => setWent(true)}>Yes</button>
      <button type="button" className="detail119-review" aria-pressed={went === false} onClick={() => setWent(false)}>No</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><span className="text-sm font-semibold">Private rating (optional)</span>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className="detail119-review" aria-pressed={rating === value} onClick={() => setRating(value)}>{value}</button>)}</div>
    <button type="button" disabled={busy || went === null} className="detail119-primary mt-3" onClick={() => void submit()}>{busy ? "Saving…" : "Save follow-up"}</button>
    {isHost && attendees.length ? <div className="mt-4 border-t pt-3"><strong className="text-sm">Host attendance confirmation</strong><p className="text-xs text-slate-500">Confirming attendance does not overwrite an attendee’s own response.</p>{attendees.map((member) => { const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles; return <div key={member.user_id} className="mt-2 flex items-center gap-2 text-sm"><span className="flex-1">{profile?.display_name || "Attendee"}</span><button type="button" disabled={busy} className="detail119-review" onClick={() => void confirmAttendance(member.user_id, true)}>Attended</button><button type="button" disabled={busy} className="detail119-review" onClick={() => void confirmAttendance(member.user_id, false)}>Didn’t attend</button></div>; })}</div> : null}
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
  </section>;
}
