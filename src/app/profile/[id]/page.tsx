"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export const runtime = "edge";

export default function ProfilePage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    if (!supabase) return;

    const load = async () => {
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id,display_name,city,bio,avatar_url")
        .eq("id", params.id)
        .maybeSingle();
      if (pErr) return setStatus(pErr.message);
      if (!p) return setStatus("Profile not found.");

      setProfile(p as Profile);
      const { data: q, error: qErr } = await supabase
        .from("quests")
        .select("id,title,city,skill_level")
        .eq("creator_id", params.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (qErr) return setStatus(qErr.message);
      setQuests((q as Quest[]) || []);
      setStatus("");
    };

    void load();
  }, [supabase, params.id]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <Link href="/" className="inline-block border rounded px-3 py-2">← Back to listings</Link>

        {status && !profile ? (
          <div className="rounded-2xl border bg-white p-4 text-sm">{status}</div>
        ) : (
          <>
            <section className="rounded-2xl border bg-white p-4 flex gap-4 items-center">
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
