"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatReportReference } from "@/lib/reporting";

type Profile = {
  id: string;
  display_name: string | null;
  city: string | null;
  bio: string | null;
  friends_visibility?: "public" | "private";
  avatar_url?: string | null;
};

type Quest = {
  id: string;
  title: string;
  city: string | null;
  skill_level: string;
};

type FriendEdge = {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
};

export const runtime = "edge";

export default function ProfilePage() {
  const supabase = getSupabaseClient();
  const params = useParams<{ id?: string | string[] }>();
  const profileId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [friendship, setFriendship] = useState<FriendEdge | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<FriendEdge[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendEdge[]>([]);
  const [incomingRequestProfiles, setIncomingRequestProfiles] = useState<Record<string, Profile>>({});
  const [outgoingRequestProfiles, setOutgoingRequestProfiles] = useState<Record<string, Profile>>({});
  const [status, setStatus] = useState("Loading...");
  const [reloadTick, setReloadTick] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate_profile");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");

  function sanitizeLocationLabel(input?: string | null) {
    const raw = (input || "").trim();
    if (!raw) return "";
    return raw.replace(/,\s*(Florida|FL)$/i, "").replace(/\s+\b(Florida|FL)\b$/i, "").trim();
  }

  const isOwnProfile = useMemo(() => !!(viewerId && profileId && viewerId === profileId), [viewerId, profileId]);
  const blockEdge = useMemo(() => {
    if (!viewerId || !profileId) return null;
    return friendship?.status === "blocked" ? friendship : null;
  }, [friendship, profileId, viewerId]);
  const youBlockedThem = useMemo(() => !!(blockEdge && blockEdge.requester_id === viewerId && blockEdge.addressee_id === profileId), [blockEdge, profileId, viewerId]);
  const canViewFriends = useMemo(() => {
    if (isOwnProfile) return true;
    if (!profile) return false;
    if ((profile.friends_visibility || "public") === "public") return true;
    return friendship?.status === "accepted";
  }, [isOwnProfile, profile, friendship]);

  const reportFeedbackTone = reportFeedback.toLowerCase().includes("couldn't") || reportFeedback.toLowerCase().includes("try again")
    ? "error"
    : reportFeedback.toLowerCase().includes("submitted")
      ? "success"
      : "neutral";

  useEffect(() => {
    if (!supabase) return;
    if (!profileId) {
      setStatus("Profile not found.");
      return;
    }
    if (!/^[0-9a-fA-F-]{36}$/.test(profileId)) {
      setStatus("Invalid profile id.");
      return;
    }

    const load = async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id ?? null;
      setViewerId(uid);

      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id,display_name,city,bio,friends_visibility,avatar_url")
        .eq("id", profileId)
        .maybeSingle();
      if (pErr) return setStatus(pErr.message);
      if (!p) return setStatus("Profile not found.");

      setProfile(p as Profile);
      const { data: q, error: qErr } = await supabase
        .from("quests")
        .select("id,title,city,skill_level")
        .eq("creator_id", profileId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (qErr) return setStatus(qErr.message);
      setQuests((q as Quest[]) || []);

      const { data: allFriendEdges } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

      const allEdges = (allFriendEdges || []) as FriendEdge[];
      const acceptedEdges = allEdges.filter((f) => f.status === "accepted");
      const friendIds = acceptedEdges
        .map((f) => (f.requester_id === profileId ? f.addressee_id : f.requester_id))
        .filter((id) => id && id !== profileId);

      let edgeWithViewer: FriendEdge | null = null;
      if (uid && uid !== profileId) {
        edgeWithViewer = allEdges.find((f) =>
          (f.requester_id === uid && f.addressee_id === profileId) ||
          (f.requester_id === profileId && f.addressee_id === uid)
        ) || null;
        setFriendship(edgeWithViewer);
      } else {
        setFriendship(null);
      }

      const canSeeFriends = !!(uid && uid === profileId) || (p as Profile).friends_visibility !== "private" || edgeWithViewer?.status === "accepted";

      if (canSeeFriends && friendIds.length) {
        const { data: friendProfiles } = await supabase
          .from("profiles")
          .select("id,display_name,city,bio,friends_visibility,avatar_url")
          .in("id", friendIds);
        setFriends((friendProfiles as Profile[]) || []);
      } else {
        setFriends([]);
      }

      if (uid && uid === profileId) {
        const incoming = allEdges.filter((f) => f.addressee_id === uid && f.status === "pending");
        const outgoing = allEdges.filter((f) => f.requester_id === uid && f.status === "pending");
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);

        const requestProfileIds = Array.from(new Set([
          ...incoming.map((r) => r.requester_id),
          ...outgoing.map((r) => r.addressee_id),
        ]));

        if (requestProfileIds.length) {
          const { data: requestProfiles } = await supabase
            .from("profiles")
            .select("id,display_name,city,bio,friends_visibility,avatar_url")
            .in("id", requestProfileIds);
          const map = Object.fromEntries(((requestProfiles as Profile[]) || []).map((rp) => [rp.id, rp]));
          setIncomingRequestProfiles(map);
          setOutgoingRequestProfiles(map);
        } else {
          setIncomingRequestProfiles({});
          setOutgoingRequestProfiles({});
        }
      } else {
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setIncomingRequestProfiles({});
        setOutgoingRequestProfiles({});
      }

      setStatus("");
    };

    void load();
  }, [supabase, profileId, reloadTick]);

  async function addFriend() {
    if (!supabase || !viewerId || !profileId || viewerId === profileId) return;

    // If they already requested me, accept that request instead of creating a duplicate reverse row.
    const { data: reverse } = await supabase
      .from("friends")
      .select("requester_id,addressee_id,status")
      .eq("requester_id", profileId)
      .eq("addressee_id", viewerId)
      .maybeSingle();

    if ((reverse as FriendEdge | null)?.status === "pending") {
      const { error: acceptErr } = await supabase
        .from("friends")
        .update({ status: "accepted" })
        .eq("requester_id", profileId)
        .eq("addressee_id", viewerId);
      if (acceptErr) return setStatus(acceptErr.message);
      setStatus("Friend request accepted ✅");
      setReloadTick((x) => x + 1);
      return;
    }

    const { error } = await supabase.from("friends").insert({ requester_id: viewerId, addressee_id: profileId, status: "pending" });
    if (error && !error.message.toLowerCase().includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    setStatus("Friend request sent ✅");
    setReloadTick((x) => x + 1);
  }

  async function acceptRequest(requesterId: string) {
    if (!supabase || !viewerId) return;
    const { error } = await supabase.from("friends").update({ status: "accepted" }).eq("requester_id", requesterId).eq("addressee_id", viewerId);
    if (error) return setStatus(error.message);
    setStatus("Friend request accepted ✅");
    setReloadTick((x) => x + 1);
  }

  async function declineRequest(requesterId: string) {
    if (!supabase || !viewerId) return;
    const { error } = await supabase.from("friends").delete().eq("requester_id", requesterId).eq("addressee_id", viewerId);
    if (error) return setStatus(error.message);
    setStatus("Request declined.");
    setReloadTick((x) => x + 1);
  }

  async function cancelRequest() {
    if (!supabase || !viewerId || !profileId) return;
    const { error } = await supabase.from("friends").delete().eq("requester_id", viewerId).eq("addressee_id", profileId).eq("status", "pending");
    if (error) return setStatus(error.message);
    setStatus("Friend request canceled.");
    setReloadTick((x) => x + 1);
  }

  async function cancelOutgoingRequest(targetId: string) {
    if (!supabase || !viewerId) return;
    const { error } = await supabase.from("friends").delete().eq("requester_id", viewerId).eq("addressee_id", targetId).eq("status", "pending");
    if (error) return setStatus(error.message);
    setStatus("Friend request canceled.");
    setReloadTick((x) => x + 1);
  }

  async function submitProfileReport() {
    if (!supabase || !viewerId || !profileId || viewerId === profileId) return;
    setSubmittingReport(true);
    const { data, error } = await supabase.from("reports").insert({
      reporter_id: viewerId,
      reported_user_id: profileId,
      context_type: "profile_account",
      reason_code: reportReason,
      details: reportDetails.trim() || null,
      auto_flags: {
        reporter_name: viewerId,
        reported_user_name: profile?.display_name || profileId,
      },
    }).select("id").single();
    setSubmittingReport(false);
    if (error) {
      setReportFeedback("We couldn't submit that report right now. Please try again in a moment.");
      return;
    }
    setShowReportModal(false);
    setReportDetails("");
    setReportFeedback(`Profile report submitted. Reference ${formatReportReference(data?.id || null)}.`);
  }

  async function removeFriend(targetId: string) {
    if (!supabase || !viewerId) return;
    const targetName = targetId === profileId ? (profile?.display_name || "this person") : "this person";
    const ok = window.confirm(`Remove ${targetName} as a friend?`);
    if (!ok) return;
    const { error } = await supabase
      .from("friends")
      .delete()
      .or(`and(requester_id.eq.${viewerId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${viewerId})`);
    if (error) return setStatus(error.message);
    setStatus("Friend removed.");
    setReloadTick((x) => x + 1);
  }

  async function blockUser() {
    if (!supabase || !viewerId || !profileId || viewerId === profileId) return;
    const { data: hostedQuests } = await supabase.from("quests").select("id").eq("creator_id", viewerId);
    const hostedQuestIds = ((hostedQuests || []) as Array<{ id: string }>).map((q) => q.id);
    await supabase.from("friends").delete().eq("requester_id", viewerId).eq("addressee_id", profileId);

    const { error } = await supabase.from("friends").upsert({
      requester_id: viewerId,
      addressee_id: profileId,
      status: "blocked",
    });
    if (error) return setStatus(error.message);

    if (hostedQuestIds.length) {
      await supabase.from("quest_members").delete().eq("user_id", profileId).in("quest_id", hostedQuestIds);
      await supabase.from("quest_exact_location_access").delete().eq("user_id", profileId).in("quest_id", hostedQuestIds);
    }

    setStatus("User blocked.");
    setShowBlockConfirm(false);
    setReloadTick((x) => x + 1);
  }

  async function unblockUser() {
    if (!supabase || !viewerId || !profileId || viewerId === profileId) return;
    const { error } = await supabase.from("friends").delete().eq("requester_id", viewerId).eq("addressee_id", profileId);
    if (error) return setStatus(error.message);
    setStatus("User unblocked.");
    setShowUnblockConfirm(false);
    setReloadTick((x) => x + 1);
  }

  return (
    <main className="page-shell page-profile min-h-screen bg-transparent p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <Link href="/" className="inline-block border rounded px-3 py-2">← Back to listings</Link>

        {status && !profile ? (
          <div className="rounded-2xl border bg-white p-4 text-sm">{status}</div>
        ) : (
          <>
            <section className="rounded-2xl border bg-white p-4 flex gap-4 items-center justify-between">
              <div className="flex gap-4 items-center">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name || "Profile"} className="h-20 w-20 rounded-full border object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-full border bg-gray-100" />
                )}
                <div>
                  <h1 className="text-2xl font-bold">{profile?.display_name || "SideQuest user"}</h1>
                  <p className="text-sm text-gray-600">{sanitizeLocationLabel(profile?.city) || "City not set"}</p>
                  {profile?.bio && <p className="text-sm mt-1">{profile.bio}</p>}
                </div>
              </div>

              <div className="flex gap-2">
                {isOwnProfile ? (
                  <Link href="/settings" className="border rounded px-3 py-2">Edit profile</Link>
                ) : (
                  <>
                    <button
                      className="border rounded px-3 py-2"
                      onClick={() => {
                        if (friendship?.status === "accepted") return void removeFriend(profileId as string);
                        if (friendship?.status === "pending" && friendship.requester_id === viewerId) return void cancelRequest();
                        if (friendship?.status === "pending" && friendship.addressee_id === viewerId) return void acceptRequest(friendship.requester_id);
                        void addFriend();
                      }}
                    >
                      {friendship?.status === "accepted"
                        ? "Unfriend"
                        : youBlockedThem
                          ? "Blocked"
                        : friendship?.status === "pending" && friendship.requester_id === viewerId
                          ? "Cancel request"
                          : friendship?.status === "pending" && friendship.addressee_id === viewerId
                            ? "Accept friend request"
                            : "Add friend"}
                    </button>
                    {youBlockedThem ? (
                      <button className="border rounded px-3 py-2 text-red-700 border-red-300 bg-red-50" onClick={() => setShowUnblockConfirm(true)}>Unblock</button>
                    ) : (
                      <button className="border rounded px-3 py-2 text-red-700 border-red-300 bg-red-50" onClick={() => setShowBlockConfirm(true)}>Block</button>
                    )}
                    <button className="border rounded px-3 py-2 text-red-700 border-red-300 bg-red-50" onClick={() => { setShowReportModal(true); setReportFeedback(""); }}>Report</button>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 space-y-3">
              <h2 className="font-semibold">Friends</h2>

              {isOwnProfile && incomingRequests.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2">Incoming requests</p>
                  <div className="grid gap-2">
                    {incomingRequests.map((r) => {
                      const rp = incomingRequestProfiles[r.requester_id];
                      return (
                        <div key={`in-${r.requester_id}`} className="flex items-center justify-between rounded border px-2 py-1 gap-2">
                          <Link href={`/profile/${r.requester_id}`} className="inline-flex items-center gap-2 min-w-0">
                            {rp?.avatar_url ? (
                              <img src={rp.avatar_url} alt={rp.display_name || "Profile"} className="h-7 w-7 rounded-full object-cover border" />
                            ) : <div className="h-7 w-7 rounded-full bg-gray-100 border" />}
                            <span className="text-sm truncate">{rp?.display_name || "View profile"}</span>
                          </Link>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void acceptRequest(r.requester_id)}>Accept</button>
                            <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void declineRequest(r.requester_id)}>Decline</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isOwnProfile && outgoingRequests.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2">Sent requests</p>
                  <div className="flex flex-wrap gap-2">
                    {outgoingRequests.map((r) => {
                      const rp = outgoingRequestProfiles[r.addressee_id];
                      return (
                        <button key={`out-${r.addressee_id}`} type="button" className="text-xs border rounded-full px-2 py-1" onClick={() => void cancelOutgoingRequest(r.addressee_id)}>
                          Cancel {rp?.display_name || "request"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!canViewFriends ? (
                <p className="text-sm text-gray-500">Friends list is private.</p>
              ) : friends.length === 0 ? (
                <p className="text-sm text-gray-500">No friends yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {friends.map((f) => (
                    <Link key={f.id} href={`/profile/${f.id}`} className="inline-flex items-center gap-2 border rounded-full px-2 py-1 bg-gray-50">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt={f.display_name || "Friend"} className="h-6 w-6 rounded-full object-cover border" />
                      ) : (
                        <div className="h-6 w-6 rounded-full border bg-white" />
                      )}
                      <span className="text-xs">{f.display_name || "Friend"}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <h2 className="font-semibold mb-2">Recent listings</h2>
              {quests.length === 0 ? (
                <p className="text-sm text-gray-500">No listings yet.</p>
              ) : (
                <div className="space-y-2">
                  {quests.map((q) => (
                    <div key={q.id} className="rounded-xl border p-3">
                      <p className="font-medium">{q.title}</p>
                      <p className="text-xs text-gray-500">{q.skill_level} · {q.city || "city tbd"}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showBlockConfirm && !isOwnProfile && (
        <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Block user</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowBlockConfirm(false)}>Close</button>
            </div>
            <p className="text-sm text-gray-700">Block this user? They won’t be able to friend you or message you from the app. If you host a quest, they’ll be removed from your hosted listings.</p>
            <div className="flex justify-end gap-2">
              <button className="border rounded px-3 py-2" onClick={() => setShowBlockConfirm(false)}>Cancel</button>
              <button className="bg-red-600 text-white rounded px-3 py-2" onClick={() => void blockUser()}>Block user</button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && !isOwnProfile && (
        <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Report profile</h3>
              <button className="border rounded px-2 py-1" onClick={() => { setShowReportModal(false); setReportFeedback(""); }}>Close</button>
            </div>
            <select className="border rounded px-3 py-2" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              <option value="inappropriate_profile">Inappropriate profile</option>
              <option value="fake_identity">Fake identity</option>
              <option value="impersonation">Impersonation</option>
              <option value="other">Other</option>
            </select>
            <textarea className="border rounded px-3 py-2" placeholder="Details (optional)" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
            <div className="flex items-end justify-between gap-3">
              <div className={`min-w-0 flex-1 text-sm ${reportFeedbackTone === "error" ? "text-red-700" : reportFeedbackTone === "success" ? "text-emerald-700" : "text-slate-700"}`}>
                {reportFeedback ? <span>{reportFeedback}</span> : null}
              </div>
              <div className="flex justify-end gap-2 shrink-0">
                <button className="border rounded px-3 py-2" onClick={() => { setShowReportModal(false); setReportFeedback(""); }}>Cancel</button>
                <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={submittingReport} onClick={() => void submitProfileReport()}>{submittingReport ? "Submitting..." : "Submit report"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnblockConfirm && !isOwnProfile && (
        <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Unblock user</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowUnblockConfirm(false)}>Close</button>
            </div>
            <p className="text-sm text-gray-700">Unblock this user? They’ll be able to friend or message you again.</p>
            <div className="flex justify-end gap-2">
              <button className="border rounded px-3 py-2" onClick={() => setShowUnblockConfirm(false)}>Cancel</button>
              <button className="bg-red-600 text-white rounded px-3 py-2" onClick={() => void unblockUser()}>Unblock user</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
