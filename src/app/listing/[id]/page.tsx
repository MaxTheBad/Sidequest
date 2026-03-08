"use client";

import Link from "next/link";
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
  hobbies?: { name: string | null }[] | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | null;
};

export const runtime = "edge";

export default function ListingPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseClient();
  const [listing, setListing] = useState<Listing | null>(null);
  const [status, setStatus] = useState("Loading listing...");

  useEffect(() => {
    if (!supabase) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("quests")
        .select("id,creator_id,title,description,city,skill_level,group_size,availability,media_video_url,media_source,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
        .eq("id", params.id)
        .maybeSingle();

      if (error) return setStatus(error.message);
      if (!data) return setStatus("Listing not found.");
      setListing(data as Listing);
      setStatus("");
    };

    void load();
  }, [supabase, params.id]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Link href="/" className="inline-block border rounded px-3 py-2">← Back to listings</Link>

        {status && !listing ? (
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

            <p className="text-sm text-gray-600">{listing.hobbies?.[0]?.name || "Hobby"} · {listing.skill_level} · group {listing.group_size}</p>
            <p className="text-sm">{listing.description || "No description yet."}</p>
            <p className="text-xs text-gray-500">{listing.city || "city tbd"} · {listing.availability || "availability tbd"}</p>

            <div className="pt-2">
              <Link href="/inbox" className="border rounded px-3 py-2 inline-block">Open inbox</Link>
            </div>
          </article>
        ) : null}
      </div>
    </main>
  );
}
