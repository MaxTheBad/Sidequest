"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { createFollowUpActionRunner, followUpPayload, getFollowUpEligibility, questLifecyclePayload } from "@/lib/post-quest-followup";

// Enable only where the companion migration and RPCs are deployed.
const FOLLOW_UPS_ENABLED = process.env.NEXT_PUBLIC_POST_QUEST_FOLLOW_UPS === "true";

type Quest = { id: string; creator_id: string; status?: string | null; starts_at?: string | null; ends_at?: string | null; completed_at?: string | null };
type Member = { user_id: string; status?: string | null; profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null };

export function PostQuestFollowUp({ quest, userId, approvedParticipant, isHost, members, onLifecycleSaved }: { quest: Quest; userId: string | null; approvedParticipant: boolean; isHost: boolean; members: Member[]; onLifecycleSaved: (quest: Quest) => void }) {
  const [went, setWent] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [endTime, setEndTime] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [runner] = useState(createFollowUpActionRunner);
  const currentQuest = useRef(quest);
  useEffect(() => { currentQuest.current = quest; }, [quest]);
  useEffect(() => () => runner.invalidate(), [runner]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  if (!FOLLOW_UPS_ENABLED) return null;
  const eligibility = getFollowUpEligibility({ quest, userId, approvedParticipant, isHost, now });
  if (!userId || (!approvedParticipant && !isHost) || eligibility.reason === "cancelled") return null;
  if (!eligibility.eligible && !isHost) return null;

  function run(request: () => PromiseLike<{ data?: unknown; error?: unknown }>, success: string, onSaved?: (data: unknown) => void) {
    void runner.run(request, {
      onBusy: setBusy,
      onSuccess: (data: unknown) => { onSaved?.(data); setMessage(success); },
      onError: (error: unknown) => setMessage(error && typeof error === "object" && "message" in error ? String(error.message) : "Could not save. Please try again."),
    });
  }

  async function submit() {
    if (!userId || went === null) return setMessage("Choose whether you went.");
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage("Follow-ups are unavailable right now.");
    run(async () => {
      if (!getFollowUpEligibility({ quest: currentQuest.current, userId, approvedParticipant, isHost }).eligible) throw new Error("This quest is not eligible for a follow-up.");
      return supabase.rpc("submit_quest_follow_up", followUpPayload({ questId: quest.id, went, rating }));
    }, "Your private follow-up was saved.");
  }

  async function confirmAttendance(memberId: string, attended: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage("Follow-ups are unavailable right now.");
    run(async () => {
      if (!isHost || !getFollowUpEligibility({ quest: currentQuest.current, userId, approvedParticipant, isHost }).eligible) throw new Error("Attendance confirmation is not available.");
      return supabase.rpc("confirm_quest_attendance", { p_quest_id: quest.id, p_user_id: memberId, p_attended: attended });
    }, "Attendance confirmation saved. Conflicts remain disputed.");
  }

  function saveLifecycle(markCompleted: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage("Follow-ups are unavailable right now.");
    run(async () => {
      const payload = questLifecyclePayload({ quest: currentQuest.current, userId, endsAt: markCompleted ? new Date().toISOString() : endTime, markCompleted });
      const result = await supabase.rpc("set_quest_lifecycle", payload);
      if (!result.error && result.data?.id !== quest.id) throw new Error("Could not confirm the saved lifecycle. Please reload.");
      return result;
    }, markCompleted ? "Quest marked complete." : "End time saved.", (data) => {
      const saved = data as Quest;
      onLifecycleSaved({ id: saved.id, creator_id: quest.creator_id, ends_at: saved.ends_at, completed_at: saved.completed_at, status: saved.status });
    });
  }

  const attendees = members.filter((member) => member.status === "approved" && member.user_id !== userId);
  return <section className="detail119-section" aria-labelledby="post-quest-follow-up-title">
    <h2 id="post-quest-follow-up-title">After the quest</h2>
    {isHost ? <div className="mt-3 space-y-2"><p className="text-sm">Record when the quest ended before collecting private follow-ups.</p>{quest.ends_at ? <p className="text-sm">Recorded end: {new Date(quest.ends_at).toLocaleString()}</p> : null}<label className="block text-sm">Quest end time<input type="datetime-local" className="ml-2 rounded border p-2" value={endTime} disabled={busy} onChange={(event) => setEndTime(event.target.value)} /></label><button type="button" disabled={busy || !endTime} onClick={() => saveLifecycle(false)}>Save end time</button><button type="button" className="ml-3" disabled={busy || !!quest.completed_at || (!!quest.starts_at && Date.parse(quest.starts_at) > now)} onClick={() => saveLifecycle(true)}>Mark complete now</button></div> : null}
    {eligibility.eligible ? <>
    <p className="text-sm text-slate-600">Your response is private. Different attendee and host responses are shown as disputed, not treated as a no-show.</p>
    <div className="mt-3 flex flex-wrap gap-2"><span className="text-sm font-semibold">Did you go?</span>
      <button type="button" disabled={busy} className="detail119-review" aria-pressed={went === true} onClick={() => setWent(true)}>Yes</button>
      <button type="button" disabled={busy} className="detail119-review" aria-pressed={went === false} onClick={() => setWent(false)}>No</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><span className="text-sm font-semibold">Private rating (optional)</span>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className="detail119-review" aria-pressed={rating === value} onClick={() => setRating(value)}>{value}</button>)}</div>
    <button type="button" disabled={busy || went === null} className="detail119-primary mt-3" onClick={() => void submit()}>{busy ? "Saving…" : "Save follow-up"}</button>
    {isHost && attendees.length ? <div className="mt-4 border-t pt-3"><strong className="text-sm">Host attendance confirmation</strong><p className="text-xs text-slate-500">Confirming attendance does not overwrite an attendee’s own response.</p>{attendees.map((member) => { const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles; return <div key={member.user_id} className="mt-2 flex items-center gap-2 text-sm"><span className="flex-1">{profile?.display_name || "Attendee"}</span><button type="button" disabled={busy} className="detail119-review" onClick={() => void confirmAttendance(member.user_id, true)}>Attended</button><button type="button" disabled={busy} className="detail119-review" onClick={() => void confirmAttendance(member.user_id, false)}>Didn’t attend</button></div>; })}</div> : null}
    </> : null}
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
  </section>;
}
