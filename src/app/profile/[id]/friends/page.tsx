"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type FriendEdge = {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
};

export const runtime = "edge";

export default function ProfileFriendsPage() {
  const supabase = getSupabaseClient();
  const params = useParams<{ id?: string | string[] }>();
  const profileId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Array<Profile & { mutualCount: number }>>([]);
  const [status, setStatus] = useState("Loading...");

  const invalidProfileId = !profileId || !/^[0-9a-fA-F-]{36}$/.test(profileId);

  useEffect(() => {
    if (!supabase || invalidProfileId) return;

    const load = async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id ?? null;

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .eq("id", profileId)
        .maybeSingle();
      if (profileErr) return setStatus(profileErr.message);
      if (!profileData) return setStatus("Profile not found.");
      setProfile(profileData as Profile);

      const { data: allEdges, error: edgesErr } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);
      if (edgesErr) return setStatus(edgesErr.message);

      const acceptedEdges = ((allEdges || []) as FriendEdge[]).filter((edge) => edge.status === "accepted");
      const friendIds = acceptedEdges
        .map((edge) => (edge.requester_id === profileId ? edge.addressee_id : edge.requester_id))
        .filter((id) => id && id !== profileId);

      let viewerFriendIds: string[] = [];
      if (uid) {
        const { data: viewerEdges, error: viewerErr } = await supabase
          .from("friends")
          .select("requester_id,addressee_id,status")
          .eq("status", "accepted")
          .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
        if (viewerErr) return setStatus(viewerErr.message);
        viewerFriendIds = Array.from(
          new Set(
            ((viewerEdges || []) as FriendEdge[])
              .flatMap((edge) => [edge.requester_id, edge.addressee_id])
              .filter((id) => id !== uid),
          ),
        );
      }

      if (!friendIds.length) {
        setFriends([]);
        setStatus("");
        return;
      }

      const { data: friendProfiles, error: friendErr } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .in("id", friendIds);
      if (friendErr) return setStatus(friendErr.message);

      const withMutualCounts = ((friendProfiles || []) as Profile[]).map((friend) => {
        const mutualCount = uid
          ? friendIds.filter((friendId) => friendId !== friend.id && viewerFriendIds.includes(friendId) && friendId !== profileId).length
          : 0;
        return { ...friend, mutualCount };
      });

      setFriends(withMutualCounts);
      setStatus("");
    };

    void load();
  }, [supabase, invalidProfileId, profileId]);

  const title = useMemo(() => profile?.display_name || "Friends", [profile?.display_name]);

  if (invalidProfileId) {
    return <main className="page-shell min-h-screen p-4"><div className="mx-auto max-w-3xl rounded-2xl border bg-white p-4 text-sm">Invalid profile id.</div></main>;
  }

  return (
    <main className="page-shell min-h-screen bg-transparent p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={`/profile/${profileId}`} className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium shadow-sm">
          <span aria-hidden="true">←</span>
          Back to profile
        </Link>

        <section className="rounded-[28px] border bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Friends</p>
              <h1 className="text-2xl font-black tracking-tight">{title}</h1>
            </div>
            <p className="text-sm text-gray-500">{friends.length} total</p>
          </div>

          {status ? (
            <div className="mt-4 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600">{status}</div>
          ) : friends.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No friends to show.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border">
              <div className="grid grid-cols-[1.4fr_1fr_auto] gap-3 border-b bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                <span>Friend</span>
                <span>Mutual friends</span>
                <span className="text-right">Profile</span>
              </div>
              <div className="divide-y">
                {friends.map((friend) => (
                  <div key={friend.id} className="grid grid-cols-[1.4fr_1fr_auto] items-center gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {friend.avatar_url ? (
                        <div className="h-10 w-10 overflow-hidden rounded-full border bg-white">
                          <img src={friend.avatar_url} alt={friend.display_name || "Friend"} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full border bg-gray-100" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{friend.display_name || "Friend"}</p>
                        {friend.username ? <p className="truncate text-xs text-gray-500">@{friend.username}</p> : null}
                      </div>
                    </div>
                    <span className="text-sm text-gray-700">{friend.mutualCount}</span>
                    <Link href={`/profile/${friend.id}`} className="rounded-full border px-3 py-2 text-sm font-medium">
                      View
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
