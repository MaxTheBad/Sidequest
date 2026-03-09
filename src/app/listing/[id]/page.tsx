"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Listing = {
  id: string;
  creator_id: string;
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

type MemberRow = {
  user_id: string;
  role: "creator" | "member";
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | null;
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
  const [members, setMembers] = useState<MemberRow[]>([]);

  async function loadMembers(questId: string, uid: string | null) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("quest_members")
      .select("user_id,role,profiles:profiles!quest_members_user_id_fkey(id,display_name,avatar_url)")
      .eq("quest_id", questId)
      .order("joined_at", { ascending: true });

    if (error) return;
    const rows = (data as MemberRow[]) || [];
    setMembers(rows);
    setHasJoined(!!uid && rows.some((m) => m.user_id === uid));
  }

  useEffect(() => {
    if (!supabase || !listingId || !/^[0-9a-fA-F-]{36}$/.test(listingId)) return;

    const init = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id ?? null;
      setUserId(uid);

      const withMedia = await supabase
        .from("quests")
        .select("id,creator_id,title,description,city,skill_level,group_size,availability,media_video_url,media_source,media_items,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
        .eq("id", listingId)
        .maybeSingle();

      let data: Listing | null = withMedia.data as Listing | null;
      let error = withMedia.error;

      // Backward compatibility when DB migration for media_items has not run yet
      if (error?.message?.includes("column quests.media_items does not exist")) {
        const fallback = await supabase
          .from("quests")
          .select("id,creator_id,title,description,city,skill_level,group_size,availability,media_video_url,media_source,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
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
        const { data: saved } = await supabase
          .from("quest_bookmarks")
          .select("quest_id")
          .eq("user_id", uid)
          .eq("quest_id", listingId)
          .maybeSingle();
        setIsSaved(!!saved);
      }

      await loadMembers(listingId, uid);
    };

    void init();
  }, [supabase, listingId]);

  async function toggleJoin() {
    if (!supabase || !userId || !listing) return setStatus("Log in to join.");
    if (listing.creator_id === userId) return setStatus("You can’t join your own listing.");

    if (hasJoined) {
      const { error } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", listing.id)
        .eq("user_id", userId)
        .neq("role", "creator");
      if (error) return setStatus(error.message);
      setStatus("Left listing.");
      setHasJoined(false);
      await loadMembers(listing.id, userId);
      return;
    }

    const { error } = await supabase.from("quest_members").insert({ quest_id: listing.id, user_id: userId, role: "member" });
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setStatus("Joined listing ✅");
    setHasJoined(true);
    await loadMembers(listing.id, userId);
  }

  async function askQuestion() {
    if (!supabase || !userId || !listing) return setStatus("Log in to message listing owners.");
    if (listing.creator_id === userId) return setStatus("You can’t ask a question on your own listing.");

    const privacyInput = window.prompt('Send as "public" or "private"?', "public");
    if (!privacyInput) return;
    const mode = privacyInput.trim().toLowerCase();
    if (!["public", "private"].includes(mode)) return setStatus('Please type either "public" or "private".');

    const text = window.prompt(`Ask a ${mode} question about "${listing.title}"`);
    if (!text || !text.trim()) return;

    const prefix = mode === "private" ? "[PRIVATE] " : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: listing.id,
      sender_id: userId,
      body: `${prefix}${text.trim()}`,
    });
    if (error) return setStatus(error.message);
    setStatus(`${mode === "private" ? "Private" : "Public"} question sent ✅`);
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
                <video className="w-full rounded-xl border bg-black" src={listing.media_video_url} controls playsInline preload="metadata" />
                {listing.media_source === "live" && <span className="absolute top-2 left-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">Live video</span>}
              </div>
            )}

            {!!listing.media_items?.length && (
              <div className="grid gap-3 sm:grid-cols-2">
                {listing.media_items.map((m, i) => (
                  <div key={`${m.url}-${i}`} className="rounded-xl border p-2 bg-gray-50">
                    {m.type === "image" ? (
                      <img src={m.url} alt={m.label || "Listing media"} className="w-full h-48 object-cover rounded" />
                    ) : (
                      <video src={m.url} controls className="w-full h-48 object-cover rounded bg-black" preload="metadata" />
                    )}
                    {m.label && <p className="text-xs mt-1 text-gray-600">{m.label}</p>}
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-gray-600">{listing.hobbies?.[0]?.name || "Hobby"} · {listing.skill_level} · group {listing.group_size}</p>
            <p className="text-sm">{listing.description || "No description yet."}</p>
            <p className="text-xs text-gray-500">{listing.city || "city tbd"} · {listing.availability || "availability tbd"}</p>

            <div className="rounded-xl border bg-gray-50 p-3">
              <p className="text-sm font-medium mb-2">Joined members ({members.length})</p>
              {members.length ? (
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const p = m.profiles?.[0];
                    return (
                      <Link key={m.user_id} href={`/profile/${m.user_id}`} className="inline-flex items-center gap-2 border rounded-full bg-white px-2 py-1">
                        {p?.avatar_url ? (
                          <img src={p.avatar_url} alt={p?.display_name || "Member"} className="h-6 w-6 rounded-full object-cover border" />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-gray-100 border" />
                        )}
                        <span className="text-xs">{p?.display_name || "Member"}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No members yet.</p>
              )}
            </div>

            <div className="pt-2 flex gap-2 flex-wrap">
              {!isOwner ? (
                <>
                  <button className="border rounded px-3 py-2" onClick={() => void toggleJoin()}>{hasJoined ? "Leave" : "Join"}</button>
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
      </div>
    </main>
  );
}
