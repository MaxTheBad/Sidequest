"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/app-icons";
import { TurnstileInvisible } from "@/components/turnstile-invisible";
import { getSupabaseClient } from "@/lib/supabase";
import { formatReportReference } from "@/lib/reporting";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  bio: string | null;
  friends_visibility?: "public" | "private";
  show_location?: boolean | null;
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

export default function ProfilePage() {
  const supabase = getSupabaseClient();
  const pathname = usePathname();
  const profileId = pathname.match(/^\/profile\/([^/]+)/)?.[1];
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [recentListingsLimit, setRecentListingsLimit] = useState(10);
  const [reportReason, setReportReason] = useState("inappropriate_profile");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
  const [reportTurnstileToken, setReportTurnstileToken] = useState("");
  const invalidProfileId = !profileId || !/^[0-9a-fA-F-]{36}$/.test(profileId);

  function formatProfileLocation(city?: string | null, region?: string | null, countryCode?: string | null) {
    const regionValue = (region || "").trim().toUpperCase();
    const countryName = countryCode
      ? new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode.toUpperCase()) || countryCode.toUpperCase()
      : "";
    const cityParts = (city || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const cityName = cityParts.find((part) => {
      if (/\d/.test(part)) return false;
      if (regionValue && part.toUpperCase() === regionValue) return false;
      if (countryName && part.toLowerCase() === countryName.toLowerCase()) return false;
      return true;
    }) || "";
    const fallbackCountry = countryName
      ? ""
      : [...cityParts].reverse().find((part) => !/\d/.test(part) && part !== cityName && part.toUpperCase() !== regionValue) || "";
    return [cityName, regionValue, countryName || fallbackCountry].filter(Boolean).join(", ");
  }

  const isOwnProfile = !!(viewerId && profileId && viewerId === profileId);
  const blockEdge = !viewerId || !profileId ? null : friendship?.status === "blocked" ? friendship : null;
  const youBlockedThem = !!(blockEdge && blockEdge.requester_id === viewerId && blockEdge.addressee_id === profileId);
  const canViewFriends = isOwnProfile ? true : !!profile && (profile.friends_visibility || "public") === "public" ? true : friendship?.status === "accepted";
  const profileLocation = formatProfileLocation(profile?.city, profile?.region, profile?.country_code);
  const visibleQuests = quests.slice(0, recentListingsLimit);
  const hasMoreQuests = quests.length > recentListingsLimit;

  const reportFeedbackTone = reportFeedback.toLowerCase().includes("couldn't") || reportFeedback.toLowerCase().includes("try again")
    ? "error"
    : reportFeedback.toLowerCase().includes("submitted")
      ? "success"
      : "neutral";

  useEffect(() => {
    if (!supabase) return;
    if (invalidProfileId) return;

    const load = async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id ?? null;
      setViewerId(uid);

      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id,display_name,username,city,region,country_code,bio,friends_visibility,avatar_url,show_location")
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
        .limit(50);

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
          .select("id,display_name,username,city,region,country_code,bio,friends_visibility,avatar_url,show_location")
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
            .select("id,display_name,username,city,region,country_code,bio,friends_visibility,avatar_url,show_location")
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
  }, [supabase, invalidProfileId, profileId, reloadTick]);

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
    if (!reportTurnstileToken.trim()) return setReportFeedback("Complete the verification check before submitting.");
    const verify = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: reportTurnstileToken, action: "report-profile" }),
    });
    if (!verify.ok) return setReportFeedback("Verification failed. Please try again.");
    setSubmittingReport(true);
    const reportId = crypto.randomUUID();
    const { error } = await supabase.from("reports").insert({
      id: reportId,
      reporter_id: viewerId,
      reported_user_id: profileId,
      context_type: "profile_account",
      reason_code: reportReason,
      details: reportDetails.trim() || null,
      auto_flags: {
        reporter_name: viewerId,
        reported_user_name: profile?.display_name || profileId,
        reported_user_username: profile?.username || null,
        report_target_type: "user",
        report_target_id: profileId,
        report_target_key: `profile:${profileId}`,
        report_target_label: profile?.username ? `${profile?.display_name || "User"} (@${profile.username})` : profile?.display_name || profileId,
      },
    });
    setSubmittingReport(false);
    if (error) {
      setReportFeedback(error.message || "We couldn't submit that report right now. Please try again in a moment.");
      return;
    }

    const notify = await fetch("/api/report-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId }),
    });
    if (!notify.ok) {
      const body = await notify.text().catch(() => "");
      setReportFeedback(body || "Report saved, but email alert failed.");
      return;
    }

    setReportDetails("");
    setReportFeedback(`Profile report submitted. Reference ${formatReportReference(reportId)}.`);
    setReportTurnstileToken("");
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
        <Link href="/" className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium shadow-sm">
          <span aria-hidden="true">←</span>
          Back to listings
        </Link>

        {invalidProfileId ? (
          <div className="rounded-2xl border bg-white p-4 text-sm">Invalid profile id.</div>
        ) : status && !profile ? (
          <div className="rounded-2xl border bg-white p-4 text-sm">{status}</div>
        ) : (
          <>
            <section className="overflow-hidden rounded-[28px] border bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="relative h-32 bg-gradient-to-r from-slate-950 via-slate-800 to-slate-600">
                {profile?.avatar_url ? (
                  <div className="absolute bottom-4 left-5 size-20 shrink-0 overflow-hidden rounded-full border-4 border-white bg-white shadow-lg sm:size-24">
                    <img src={profile.avatar_url} alt={profile.display_name || "Profile"} className="aspect-square h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="absolute bottom-4 left-5 size-20 shrink-0 rounded-full border-4 border-white bg-gray-100 shadow-lg sm:size-24" />
                )}

                <div className="absolute bottom-4 right-4">
                    {isOwnProfile ? (
                      <Link href="/settings" className="inline-flex h-10 items-center rounded-full border border-white/70 bg-white px-4 text-sm font-semibold shadow-lg">Edit profile</Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold shadow-lg ring-1 ring-black/5 ${friendship?.status === "accepted" ? "border border-white/20 bg-slate-950 text-white" : "border border-white/70 bg-white text-slate-950"}`}
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
                                  ? "Accept request"
                                  : "Add friend"}
                        </button>
                        <button
                          type="button"
                          aria-label="More actions"
                          className="inline-flex size-10 items-center justify-center rounded-full border border-white/70 bg-white shadow-lg ring-1 ring-black/5"
                          onClick={() => setShowMoreMenu((v) => !v)}
                        >
                          <AppIcon name="more" className="h-5 w-5" />
                        </button>
                        {showMoreMenu ? (
                          <div className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-2xl border bg-white p-1 shadow-2xl">
                            {youBlockedThem ? (
                              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setShowMoreMenu(false); setShowUnblockConfirm(true); }}>
                                <span>Unblock</span>
                              </button>
                            ) : (
                              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setShowMoreMenu(false); setShowBlockConfirm(true); }}>
                                <span>Block</span>
                              </button>
                            )}
                            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setShowMoreMenu(false); setShowReportModal(true); setReportFeedback(""); }}>
                              <span>Report</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              <div className="px-5 pb-5 pt-4">
                <h1 className="truncate text-2xl font-black tracking-tight">{profile?.display_name || "SideQuest user"}</h1>
                <div className="mt-3 flex items-center gap-x-3 overflow-x-auto whitespace-nowrap text-[11px] font-semibold text-gray-600 sm:text-xs">
                  <span>Friends {canViewFriends ? friends.length : "private"}</span>
                  <span>{quests.length} posts</span>
                  {profile?.show_location && profileLocation ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <AppIcon name="location" className="size-3.5 shrink-0" />
                      <span className="truncate">{profileLocation}</span>
                    </span>
                  ) : null}
                </div>
                {profile?.bio ? <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-700">{profile.bio}</p> : null}
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">{friends.length} total friends</p>
                    <Link href={`/profile/${profileId}/friends`} className="text-sm font-medium text-slate-950 underline underline-offset-4">
                      See all friends
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2">
                  {friends.map((f) => (
                    <Link key={f.id} href={`/profile/${f.id}`} className="inline-flex items-center gap-2 border rounded-full px-2 py-1 bg-gray-50">
                      {f.avatar_url ? (
                        <div className="h-6 w-6 overflow-hidden rounded-full border bg-white">
                          <img src={f.avatar_url} alt={f.display_name || "Friend"} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full border bg-white" />
                      )}
                      <span className="text-xs">{f.display_name || "Friend"}</span>
                    </Link>
                  ))}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <h2 className="font-semibold mb-2">Recent listings</h2>
              {quests.length === 0 ? (
                <p className="text-sm text-gray-500">No listings yet.</p>
              ) : (
                <div className="space-y-2">
                  {visibleQuests.map((q) => (
                    <Link key={q.id} href={`/listing/${q.id}`} className="block rounded-xl border p-3 transition hover:bg-gray-50">
                      <p className="font-medium">{q.title}</p>
                      <p className="text-xs text-gray-500">{q.skill_level} · {q.city || "city tbd"}</p>
                    </Link>
                  ))}
                  {hasMoreQuests ? (
                    <button type="button" className="w-full rounded-xl border px-3 py-2 text-sm font-medium" onClick={() => setRecentListingsLimit((n) => n + 10)}>
                      Load more
                    </button>
                  ) : null}
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
            <TurnstileInvisible onToken={setReportTurnstileToken} />
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
