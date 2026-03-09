"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Profile = {
  id: string;
  display_name: string | null;
  city: string | null;
  bio: string | null;
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
  const [status, setStatus] = useState("Loading...");

  const isOwnProfile = useMemo(() => !!(viewerId && profileId && viewerId === profileId), [viewerId, profileId]);

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
        .select("id,display_name,city,bio,avatar_url")
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

      const { data: friendEdges } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
        .eq("status", "accepted");

      const edges = (friendEdges || []) as FriendEdge[];
      const friendIds = edges
        .map((f) => (f.requester_id === profileId ? f.addressee_id : f.requester_id))
        .filter((id) => id && id !== profileId);

      if (friendIds.length) {
        const { data: friendProfiles } = await supabase
          .from("profiles")
          .select("id,display_name,city,bio,avatar_url")
          .in("id", friendIds);
        setFriends((friendProfiles as Profile[]) || []);
      } else {
        setFriends([]);
      }

      if (uid && uid !== profileId) {
        const { data: edge } = await supabase
          .from("friends")
          .select("requester_id,addressee_id,status")
          .or(`and(requester_id.eq.${uid},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${uid})`)
          .maybeSingle();
        setFriendship((edge as FriendEdge) || null);
      } else {
        setFriendship(null);
      }

      setStatus("");
    };

    void load();
  }, [supabase, profileId]);

  async function addFriend() {
    if (!supabase || !viewerId || !profileId || viewerId === profileId) return;
    const { error } = await supabase.from("friends").insert({ requester_id: viewerId, addressee_id: profileId, status: "pending" });
    if (error && !error.message.toLowerCase().includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    setStatus("Friend request sent ✅");
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
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
                  <p className="text-sm text-gray-600">{profile?.city || "City not set"}</p>
                  {profile?.bio && <p className="text-sm mt-1">{profile.bio}</p>}
                </div>
              </div>

              <div className="flex gap-2">
                {isOwnProfile ? (
                  <Link href="/settings" className="border rounded px-3 py-2">Edit profile</Link>
                ) : (
                  <button className="border rounded px-3 py-2" onClick={() => void addFriend()}>
                    {friendship?.status === "accepted" ? "Friends" : friendship?.status === "pending" ? "Request sent" : "Add friend"}
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <h2 className="font-semibold mb-2">Friends</h2>
              {friends.length === 0 ? (
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
    </main>
  );
}
