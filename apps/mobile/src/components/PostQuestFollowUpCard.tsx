import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { followUpPayload, getFollowUpEligibility } from "../lib/post-quest-followup";

// This component intentionally has no rating-dependent review request or
// substitute dialog. Store review is triggered only by a neutral milestone.
type Member = { id: string; display_name: string | null };

export function PostQuestFollowUpCard({ enabled, quest, userId, participant, host, members, busy, onSaveFollowUp, onConfirmAttendance, onSaveEndTime }: { enabled: boolean; quest: { id: string; status?: string | null; starts_at?: string | null; ends_at?: string | null; completed_at?: string | null }; userId: string | null; participant: boolean; host: boolean; members: Member[]; busy: boolean; onSaveFollowUp: (payload: ReturnType<typeof followUpPayload>) => void; onConfirmAttendance: (userId: string, attended: boolean) => void; onSaveEndTime: (endsAt: string, completed: boolean) => void }) {
  const [went, setWent] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [endText, setEndText] = useState(() => quest.ends_at || "");
  const eligibility = getFollowUpEligibility({ quest, userId, approvedParticipant: participant, isHost: host });
  const canSetLifecycle = enabled && host && String(quest.status || "").toLowerCase() !== "cancelled" && String(quest.status || "").toLowerCase() !== "canceled";
  const showFollowUp = enabled && eligibility.eligible;
  const otherAttendees = useMemo(() => members.filter((member) => member.id !== userId), [members, userId]);
  if (!canSetLifecycle && !showFollowUp) return null;
  return <View accessibilityLabel="Post-quest follow-up" style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#173b47" }}>
    {canSetLifecycle ? <View style={{ gap: 7 }}><Text style={{ color: "#f8fafc", fontWeight: "700" }}>Host: close out the quest</Text><Text style={{ color: "#c7dce2" }}>Set the real end time. Mark complete only after it has ended; changing this time clears a previous completion.</Text><TextInput value={endText} onChangeText={setEndText} placeholder="End time (ISO 8601)" placeholderTextColor="#9aaec2" autoCapitalize="none" style={{ color: "#f8fafc", borderWidth: 1, borderColor: "#527582", borderRadius: 10, padding: 10 }} /><View style={{ flexDirection: "row", gap: 8 }}><Pressable disabled={busy || !endText} onPress={() => onSaveEndTime(endText, false)}><Text style={{ color: "#9bd8e4" }}>Save end time</Text></Pressable><Pressable disabled={busy || !endText} onPress={() => onSaveEndTime(endText, true)}><Text style={{ color: "#9bd8e4" }}>Mark completed</Text></Pressable></View></View> : null}
    {showFollowUp ? <View style={{ gap: 8 }}><Text style={{ color: "#f8fafc", fontWeight: "700" }}>After the quest</Text><Text style={{ color: "#c7dce2" }}>Did you go? Your answer and optional rating are private. Conflicts remain disputed.</Text><View style={{ flexDirection: "row", gap: 8 }}><Pressable onPress={() => setWent(true)}><Text style={{ color: went === true ? "#86efac" : "#f8fafc" }}>Yes</Text></Pressable><Pressable onPress={() => setWent(false)}><Text style={{ color: went === false ? "#fca5a5" : "#f8fafc" }}>No</Text></Pressable></View><View style={{ flexDirection: "row", gap: 9 }}>{[1,2,3,4,5].map((value) => <Pressable key={value} onPress={() => setRating(value)}><Text style={{ color: rating === value ? "#facc15" : "#f8fafc" }}>{value}★</Text></Pressable>)}</View><Pressable disabled={busy || went === null} onPress={() => { if (went !== null) onSaveFollowUp(followUpPayload({ questId: quest.id, went, rating })); }}><Text style={{ color: "#9bd8e4" }}>{busy ? "Saving…" : "Save follow-up"}</Text></Pressable>{host && otherAttendees.map((member) => <View key={member.id} style={{ flexDirection: "row", gap: 8 }}><Text style={{ color: "#f8fafc", flex: 1 }}>{member.display_name || "Attendee"}</Text><Pressable disabled={busy} onPress={() => onConfirmAttendance(member.id, true)}><Text style={{ color: "#9bd8e4" }}>Attended</Text></Pressable><Pressable disabled={busy} onPress={() => onConfirmAttendance(member.id, false)}><Text style={{ color: "#9bd8e4" }}>Didn’t attend</Text></Pressable></View>)}</View> : null}
  </View>;
}
