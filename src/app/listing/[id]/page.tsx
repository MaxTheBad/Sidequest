"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Listing = {
  id: string;
  creator_id: string;
  join_mode?: "open" | "approval_required";
  exact_location_visibility?: "private" | "public" | "approved_members";
  exact_address?: string | null;
  title: string;
  description: string | null;
  city: string | null;
  skill_level: string;
  group_size: number;
  availability: string | null;
  media_video_url: string | null;
  media_source: "live" | "upload" | null;
  media_items?: { url: string; type: "image" | "video"; label?: string | null }[] | null;
  hobbies?: { name: string | null }[] | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | null;
};

type MemberProfile = { id: string; display_name: string | null; avatar_url: string | null };

type MemberRow = {
  user_id: string;
  role: "creator" | "cohost" | "member";
  status?: "pending" | "approved" | "declined";
  profiles?: MemberProfile[] | MemberProfile | null;
};

export const runtime = "edge";

export default function ListingPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [listing, setListing] = useState<Listing | null>(null);
  const [status, setStatus] = useState("Loading listing...");
  const [userId, setUserId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [myMembershipStatus, setMyMembershipStatus] = useState<"pending" | "approved" | "declined" | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [exactAccessUserIds, setExactAccessUserIds] = useState<string[]>([]);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionMode, setQuestionMode] = useState<"public" | "private">("public");
  const [questionText, setQuestionText] = useState("");
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [lastQuestionMs, setLastQuestionMs] = useState(0);
  const [expandedMediaIndex, setExpandedMediaIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  async function loadMembers(questId: string, uid: string | null) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("quest_members")
      .select("user_id,role,status,profiles:profiles!quest_members_user_id_fkey(id,display_name,avatar_url)")
      .eq("quest_id", questId)
      .order("joined_at", { ascending: true });

    if (error) {
      setStatus(error.message);
      return;
    }
    const rows = ((data as MemberRow[]) || []).reduce<MemberRow[]>((acc, row) => {
      if (!acc.some((x) => x.user_id === row.user_id)) acc.push(row);
      return acc;
    }, []);
    setMembers(rows);
    const mine = uid ? rows.find((m) => m.user_id === uid) : null;
    setMyMembershipStatus((mine?.status || (mine ? "approved" : null)) as "pending" | "approved" | "declined" | null);
    setHasJoined(!!mine && (mine.status || "approved") === "approved");
  }

  useEffect(() => {
    if (!supabase || !listingId || !/^[0-9a-fA-F-]{36}$/.test(listingId)) return;

    const init = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id ?? null;
      setUserId(uid);

      const withMedia = await supabase
        .from("quests")
        .select("id,creator_id,title,description,city,join_mode,exact_location_visibility,exact_address,skill_level,group_size,availability,media_video_url,media_source,media_items,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
        .eq("id", listingId)
        .maybeSingle();

      let data: Listing | null = withMedia.data as Listing | null;
      let error = withMedia.error;

      // Backward compatibility when DB migration for media_items has not run yet
      if (error?.message?.includes("column quests.media_items does not exist")) {
        const fallback = await supabase
          .from("quests")
          .select("id,creator_id,title,description,city,join_mode,exact_location_visibility,exact_address,skill_level,group_size,availability,media_video_url,media_source,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
          .eq("id", listingId)
          .maybeSingle();
        data = fallback.data as Listing | null;
        error = fallback.error;
      }

      if (error) return setStatus(error.message);
      if (!data) return setStatus("Listing not found.");
      setListing(data || null);
      setStatus("");

      if (uid) {
        const { data: saved, error: savedErr } = await supabase
          .from("quest_bookmarks")
          .select("quest_id")
          .eq("user_id", uid)
          .eq("quest_id", listingId)
          .maybeSingle();
        if (!savedErr) setIsSaved(!!saved);
      }

      await loadMembers(listingId, uid);
      if (uid) {
        const { data: accessRows } = await supabase
          .from("quest_exact_location_access")
          .select("user_id")
          .eq("quest_id", listingId);
        setExactAccessUserIds((accessRows || []).map((r: { user_id: string }) => r.user_id));
      }
    };

    void init();
  }, [supabase, listingId]);

  async function toggleJoin() {
    if (!supabase || !userId || !listing) return setStatus("Log in to join.");
    if (listing.creator_id === userId) return setStatus("You can’t join your own listing.");

    if (myMembershipStatus === "approved" || myMembershipStatus === "pending") {
      const { error } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", listing.id)
        .eq("user_id", userId);
      if (error) return setStatus(error.message);
      setStatus(myMembershipStatus === "pending" ? "Join request canceled." : "Left listing.");
      setHasJoined(false);
      setMyMembershipStatus(null);
      await loadMembers(listing.id, userId);
      return;
    }

    const nextStatus = (listing.join_mode || "open") === "approval_required" ? "pending" : "approved";
    if (myMembershipStatus === "declined") {
      const { error: delErr } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", listing.id)
        .eq("user_id", userId);
      if (delErr) return setStatus(delErr.message);
    }
    {
      const { error } = await supabase.from("quest_members").insert({ quest_id: listing.id, user_id: userId, role: "member", status: nextStatus });
      if (error && !error.message.includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    }

    setStatus(nextStatus === "pending" ? "Join request sent ⏳" : "Joined listing ✅");
    setHasJoined(nextStatus === "approved");
    setMyMembershipStatus(nextStatus);
    await loadMembers(listing.id, userId);
  }

  async function setMemberApproval(targetUserId: string, next: "pending" | "approved") {
    if (!supabase || !listing || !isManager) return;
    const { error } = await supabase
      .from("quest_members")
      .update({ status: next })
      .eq("quest_id", listing.id)
      .eq("user_id", targetUserId)
      .neq("role", "creator");
    if (error) return setStatus(error.message);
    await loadMembers(listing.id, userId);
    setStatus(next === "approved" ? "Member approved ✅" : "Moved back to pending.");
  }

  async function declineMember(targetUserId: string) {
    if (!supabase || !listing || !isManager) return;
    const { error } = await supabase
      .from("quest_members")
      .update({ status: "declined" })
      .eq("quest_id", listing.id)
      .eq("user_id", targetUserId)
      .neq("role", "creator");
    if (error) return setStatus(error.message);
    await loadMembers(listing.id, userId);
    setStatus("Request declined.");
  }

  async function setMemberRole(targetUserId: string, nextRole: "member" | "cohost") {
    if (!supabase || !listing || !isOwner) return;
    const { error } = await supabase
      .from("quest_members")
      .update({ role: nextRole })
      .eq("quest_id", listing.id)
      .eq("user_id", targetUserId)
      .neq("role", "creator")
      .eq("status", "approved");
    if (error) return setStatus(error.message);
    await loadMembers(listing.id, userId);
    setStatus(nextRole === "cohost" ? "Promoted to co-host." : "Demoted to member.");
  }

  async function toggleExactAccess(targetUserId: string, allow: boolean) {
    if (!supabase || !listing || !isManager) return;
    if (allow) {
      const { error } = await supabase.from("quest_exact_location_access").upsert({ quest_id: listing.id, user_id: targetUserId, granted_by: userId });
      if (error) return setStatus(error.message);
      setExactAccessUserIds((prev) => prev.includes(targetUserId) ? prev : [...prev, targetUserId]);
      setStatus("Exact location access granted.");
      return;
    }
    const { error } = await supabase.from("quest_exact_location_access").delete().eq("quest_id", listing.id).eq("user_id", targetUserId);
    if (error) return setStatus(error.message);
    setExactAccessUserIds((prev) => prev.filter((id) => id !== targetUserId));
    setStatus("Exact location access revoked.");
  }

  function askQuestion() {
    if (!supabase || !userId || !listing) return setStatus("Log in to message listing owners.");
    if (listing.creator_id === userId) return setStatus("You can’t ask a question on your own listing.");
    setQuestionMode("public");
    setQuestionText("");
    setShowQuestionModal(true);
  }

  async function sendQuestionFromModal() {
    if (!supabase || !userId || !listing) return;
    if (sendingQuestion) return;
    if (Date.now() - lastQuestionMs < 3000) return setStatus("Slow down a sec before sending again.");
    const trimmed = questionText.trim();
    if (!trimmed) return setStatus("Please enter your question.");
    if (trimmed.length > 500) return setStatus("Question is too long (max 500 chars).");

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count || 0) >= 6) return setStatus("Rate limit: please wait a minute before sending more messages.");

    setSendingQuestion(true);
    const prefix = questionMode === "private"
      ? `[PRIVATE to=${listing.creator_id}] `
      : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: listing.id,
      sender_id: userId,
      body: `${prefix}${trimmed}`,
    });
    setSendingQuestion(false);
    if (error) return setStatus(error.message);

    setShowQuestionModal(false);
    setQuestionText("");
    setLastQuestionMs(Date.now());
    setStatus(`${questionMode === "private" ? "Private" : "Public"} question sent ✅`);
  }

  async function toggleSave() {
    if (!supabase || !userId || !listing) return setStatus("Log in to save listings.");

    if (isSaved) {
      const { error } = await supabase.from("quest_bookmarks").delete().eq("user_id", userId).eq("quest_id", listing.id);
      if (error) return setStatus(error.message);
      setIsSaved(false);
      setStatus("Removed from saved listings.");
      return;
    }

    const { error } = await supabase.from("quest_bookmarks").insert({ user_id: userId, quest_id: listing.id });
    if (error?.message.includes("quest_bookmarks")) return setStatus("Bookmarks not set up yet. Run the bookmarks SQL migration.");
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setIsSaved(true);
    setStatus("Saved listing ✅");
  }

  async function deleteListing() {
    if (!supabase || !userId || !listing) return;
    if (listing.creator_id !== userId) return;
    const ok = window.confirm("Delete this listing? This cannot be undone.");
    if (!ok) return;

    const { error } = await supabase.from("quests").delete().eq("id", listing.id).eq("creator_id", userId);
    if (error) return setStatus(error.message);
    router.push("/");
  }

  const isOwner = !!(userId && listing && userId === listing.creator_id);
  const myMemberRow = userId ? members.find((m) => m.user_id === userId) : null;
  const isManager = !!(isOwner || (myMemberRow && myMemberRow.role === "cohost" && (myMemberRow.status || "approved") === "approved"));
  const canViewExactAddress = !!(listing && userId && (
    isManager ||
    listing.exact_location_visibility === "public" ||
    (listing.exact_location_visibility === "approved_members" && myMembershipStatus === "approved") ||
    exactAccessUserIds.includes(userId)
  ));

  function locationSummary(input?: string | null) {
    const raw = (input || "").trim();
    if (!raw) return "";
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return "";

    const country = parts[parts.length - 1] || "";
    const postal = [...parts].reverse().find((p) => /\d{4,}/.test(p)) || "";
    const city = parts.find((p, i) => {
      if (i === 0 || i >= parts.length - 1) return false;
      if (!/[A-Za-z]/.test(p)) return false;
      if (/county/i.test(p)) return false;
      if (/(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|trail|trl\.?|circle|cir\.?)/i.test(p)) return false;
      return true;
    }) || "";

    return [city, postal, country].filter(Boolean).join(", ");
  }

  function memberProfileOf(member: MemberRow): MemberProfile | null {
    if (!member.profiles) return null;
    return Array.isArray(member.profiles) ? (member.profiles[0] || null) : member.profiles;
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Link href="/" className="inline-block border rounded px-3 py-2">← Back to listings</Link>

        {!listing && status ? (
          <div className="rounded-2xl border bg-white p-4 text-sm">{status}</div>
        ) : listing ? (
          <article className="rounded-2xl border bg-white p-4 space-y-4">
            <div className="flex items-center gap-3">
              {listing.profiles?.[0]?.avatar_url ? (
                <img src={listing.profiles[0].avatar_url} alt="Creator" className="h-12 w-12 rounded-full border object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full border bg-gray-100" />
              )}
              <div>
                <h1 className="text-2xl font-bold">{listing.title}</h1>
                <Link href={`/profile/${listing.creator_id}`} className="text-sm underline text-gray-600">
                  {listing.profiles?.[0]?.display_name || "View creator profile"}
                </Link>
              </div>
            </div>

            {listing.media_video_url && (
              <div className="relative">
                <video className="w-full max-h-80 rounded-xl border bg-black object-contain" src={listing.media_video_url} controls playsInline preload="metadata" />
                {listing.media_source === "live" && <span className="absolute top-2 left-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">Live video</span>}
              </div>
            )}

            {!!listing.media_items?.length && (
              <div className="w-full overflow-x-auto pb-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
                <div className="flex gap-3 min-w-max snap-x snap-mandatory">
                  {listing.media_items.map((m, i) => (
                    <button key={`${m.url}-${i}`} type="button" className="rounded-xl border p-2 bg-gray-50 w-44 shrink-0 text-left snap-start" onClick={() => setExpandedMediaIndex(i)}>
                      {m.type === "image" ? (
                        <img src={m.url} alt={m.label || "Listing media"} className="w-full h-28 object-cover rounded" />
                      ) : (
                        <video src={m.url} className="w-full h-28 object-cover rounded bg-black" preload="metadata" muted playsInline />
                      )}
                        {m.label && <p className="text-xs mt-1 text-gray-600 truncate">{m.label}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600">{listing.hobbies?.[0]?.name || "Hobby"} · {listing.skill_level} · group {listing.group_size}</p>
            <p className="text-sm">{listing.description || "No description yet."}</p>
            <p className="text-xs text-gray-500">{listing.city || locationSummary(listing.exact_address) || "city tbd"} · {listing.availability || "availability tbd"}</p>
            {canViewExactAddress && listing.exact_address ? (
              <p className="text-xs text-emerald-700">Exact address: {listing.exact_address}</p>
            ) : (
              <p className="text-xs text-gray-500">Exact address is hidden by host privacy settings.</p>
            )}

            <div className="rounded-xl border bg-gray-50 p-3">
              <p className="text-sm font-medium mb-2">Joined members ({members.filter((m) => (m.status || "approved") === "approved").length})</p>
              {members.length ? (
                <div className="space-y-2">
                  {members.filter((m) => (m.status || "approved") === "approved").map((m) => {
                    const p = memberProfileOf(m);
                    const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                    const hasExactAccess = exactAccessUserIds.includes(m.user_id);
                    return (
                      <div key={`${m.user_id}-${m.role}`} className="inline-flex items-center gap-2 border rounded-full bg-white px-2 py-1 mr-2 mb-2">
                        <Link href={`/profile/${m.user_id}`} className="inline-flex items-center gap-2">
                          {p?.avatar_url ? (
                            <img src={p.avatar_url} alt={p?.display_name || "Member"} className="h-6 w-6 rounded-full object-cover border" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gray-100 border" />
                          )}
                          <span className="text-xs">{firstName}</span>
                        </Link>
                        {m.role === "cohost" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Co-host</span>}
                        {isManager && m.role !== "creator" && (
                          <button
                            type="button"
                            className={`text-xs border rounded px-2 py-0.5 font-semibold leading-none ${hasExactAccess ? "bg-emerald-200 border-emerald-500 text-emerald-950" : "bg-white border-slate-300 text-slate-800"}`}
                            onClick={() => void toggleExactAccess(m.user_id, !hasExactAccess)}
                          >
                            {hasExactAccess ? "Exact: on" : "Exact: off"}
                          </button>
                        )}
                        {isOwner && m.role !== "creator" && (m.status || "approved") === "approved" && (
                          <button
                            type="button"
                            className="text-xs border rounded px-2 py-0.5 font-semibold leading-none bg-white border-slate-300 text-slate-800"
                            onClick={() => void setMemberRole(m.user_id, m.role === "cohost" ? "member" : "cohost")}
                          >
                            {m.role === "cohost" ? "Demote" : "Promote"}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {isManager && members.some((m) => m.status === "pending") && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2">Pending join requests</p>
                      <div className="grid gap-2">
                        {members.filter((m) => m.status === "pending").map((m) => {
                          const p = memberProfileOf(m);
                          const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                          return (
                            <div key={`pending-${m.user_id}`} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                              <Link href={`/profile/${m.user_id}`} className="text-xs underline">{firstName}</Link>
                              <div className="flex gap-1">
                                <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void setMemberApproval(m.user_id, "approved")}>Approve</button>
                                <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void declineMember(m.user_id)}>Decline</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isManager && members.some((m) => m.status === "declined") && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2">Declined requests</p>
                      <div className="flex flex-wrap gap-2">
                        {members.filter((m) => m.status === "declined").map((m) => {
                          const p = memberProfileOf(m);
                          const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                          return <span key={`declined-${m.user_id}`} className="text-xs px-2 py-1 rounded border bg-white">{firstName}</span>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No members yet.</p>
              )}
            </div>

            {isManager && (
              <div className="rounded-xl border bg-gray-50 p-3">
                <p className="text-sm font-medium mb-2">Exact address access</p>
                {members.filter((m) => exactAccessUserIds.includes(m.user_id)).length ? (
                  <div className="flex flex-wrap gap-2">
                    {members.filter((m) => exactAccessUserIds.includes(m.user_id)).map((m) => {
                      const p = memberProfileOf(m);
                      const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                      return (
                        <button key={`exact-${m.user_id}`} type="button" className="text-xs border rounded-full bg-white px-2 py-1" onClick={() => void toggleExactAccess(m.user_id, false)}>
                          {firstName} · Revoke
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="text-xs text-gray-500">No one has manual exact-address access.</p>}
              </div>
            )}

            <div className="pt-2 flex gap-2 flex-wrap">
              {!isOwner ? (
                <>
                  <button className="border rounded px-3 py-2" onClick={() => void toggleJoin()}>{myMembershipStatus === "pending" ? "Cancel request" : (myMembershipStatus === "declined" ? "Request again" : (hasJoined ? "Leave" : ((listing.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}</button>
                  <button className="border rounded px-3 py-2" onClick={() => void askQuestion()}>Ask question</button>
                  <button className="border rounded px-3 py-2" onClick={() => void toggleSave()}>{isSaved ? "★ Saved" : "☆ Save"}</button>
                </>
              ) : (
                <>
                  <Link href="/" className="border rounded px-3 py-2 inline-block">Edit on home</Link>
                  <Link href="/inbox" className="border rounded px-3 py-2 inline-block">Open inbox</Link>
                  <button className="border border-red-300 text-red-700 rounded px-3 py-2" onClick={() => void deleteListing()}>Delete listing</button>
                </>
              )}
            </div>

            {status && <p className="text-xs text-gray-600">{status}</p>}
          </article>
        ) : null}
        {expandedMediaIndex !== null && !!listing?.media_items?.length && (
          <div
            className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4"
            onClick={() => setExpandedMediaIndex(null)}
            onTouchStart={(e) => setTouchStartX(e.changedTouches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const endX = e.changedTouches[0]?.clientX;
              if (touchStartX === null || endX === undefined) return;
              const delta = endX - touchStartX;
              if (Math.abs(delta) < 40) return;
              setExpandedMediaIndex((idx) => {
                if (idx === null || !listing.media_items?.length) return idx;
                const len = listing.media_items.length;
                return delta < 0 ? (idx + 1) % len : (idx - 1 + len) % len;
              });
            }}
          >
            {(() => {
              const items = listing.media_items || [];
              const item = items[expandedMediaIndex] || null;
              if (!item) return null;
              return item.type === "image" ? (
                <img src={item.url} alt={item.label || "Expanded media"} className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
              ) : (
                <video src={item.url} controls autoPlay className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain bg-black" onClick={(e) => e.stopPropagation()} />
              );
            })()}
            <button type="button" className="absolute top-4 right-4 border rounded px-3 py-2 bg-white" onClick={() => setExpandedMediaIndex(null)}>Close</button>
            <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white" onClick={(e) => { e.stopPropagation(); setExpandedMediaIndex((idx) => (idx === null || !listing.media_items?.length ? idx : (idx - 1 + listing.media_items.length) % listing.media_items.length)); }}>‹</button>
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white" onClick={(e) => { e.stopPropagation(); setExpandedMediaIndex((idx) => (idx === null || !listing.media_items?.length ? idx : (idx + 1) % listing.media_items.length)); }}>›</button>
          </div>
        )}
        {showQuestionModal && listing && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Ask question</h3>
                <button className="border rounded px-2 py-1" onClick={() => setShowQuestionModal(false)}>Close</button>
              </div>
              <div className="flex gap-2">
                <button type="button" className={`border rounded px-3 py-2 ${questionMode === "public" ? "bg-black text-white" : ""}`} onClick={() => setQuestionMode("public")}>Public</button>
                <button type="button" className={`border rounded px-3 py-2 ${questionMode === "private" ? "bg-black text-white" : ""}`} onClick={() => setQuestionMode("private")}>Private</button>
              </div>
              <p className="text-xs text-gray-600">Please keep questions general and avoid sharing personal information.</p>
              <textarea className="border rounded px-3 py-2 w-full" placeholder="Type your question..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={sendingQuestion || !questionText.trim()} onClick={() => void sendQuestionFromModal()}>{sendingQuestion ? "Sending..." : "Send"}</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
