"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type JoinedQuest = {
  quest_id: string;
  status: "pending" | "approved" | "declined";
  joined_at?: string | null;
  quests?: {
    id: string;
    title: string | null;
    city: string | null;
    availability: string | null;
    exact_address?: string | null;
    hobby_id?: string | null;
    hobbies?: { name: string | null }[] | null;
  } | null;
};

type SortMode = "closest" | "starting_soon" | "recent";

function locationSummary(input?: string | null) {
  const raw = (input || "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  const country = parts[parts.length - 1] || "";
  const postal = [...parts].reverse().find((p) => /\d{4,}/.test(p)) || "";
  const city = parts.find((p, i) => i > 0 && i < parts.length - 1 && /[A-Za-z]/.test(p) && !/county/i.test(p)) || "";
  return [city, postal, country].filter(Boolean).join(", ");
}

function startsSoonScore(availability?: string | null) {
  const text = (availability || "").toLowerCase();
  if (!text) return 99;
  if (/(now|today|tonight|asap)/.test(text)) return 0;
  if (/tomorrow/.test(text)) return 1;
  if (/(mon|tue|wed|thu|fri|sat|sun|weekend|weeknight)/.test(text)) return 2;
  return 3;
}

export default function JoinedPage() {
  const supabase = getSupabaseClient();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<JoinedQuest[]>([]);
  const [sort, setSort] = useState<SortMode>("closest");
  const [myCity, setMyCity] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const run = async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id;
      if (!uid) {
        if (typeof window !== "undefined") window.location.href = "/?auth=1";
        return;
      }

      const { data: me } = await supabase.from("profiles").select("city").eq("id", uid).maybeSingle();
      setMyCity((me?.city || "").toLowerCase());

      const { data, error } = await supabase
        .from("quest_members")
        .select("quest_id,status,joined_at,quests(id,title,city,availability,exact_address,hobbies(name))")
        .eq("user_id", uid)
        .in("status", ["approved", "pending"])
        .order("joined_at", { ascending: false });

      setLoading(false);
      if (error) return setStatus(error.message);
      setRows((data as JoinedQuest[]) || []);
    };
    void run();
  }, [supabase]);

  const pending = useMemo(() => rows.filter((r) => (r.status || "approved") === "pending"), [rows]);

  const approved = useMemo(() => {
    const list = rows.filter((r) => (r.status || "approved") === "approved");
    return [...list].sort((a, b) => {
      if (sort === "recent") return new Date(b.joined_at || 0).getTime() - new Date(a.joined_at || 0).getTime();
      if (sort === "starting_soon") {
        const delta = startsSoonScore(a.quests?.availability) - startsSoonScore(b.quests?.availability);
        if (delta !== 0) return delta;
      }

      const aLoc = (a.quests?.city || locationSummary(a.quests?.exact_address) || "").toLowerCase();
      const bLoc = (b.quests?.city || locationSummary(b.quests?.exact_address) || "").toLowerCase();
      const aScore = myCity && aLoc.includes(myCity) ? 0 : (aLoc ? 1 : 2);
      const bScore = myCity && bLoc.includes(myCity) ? 0 : (bLoc ? 1 : 2);
      if (aScore !== bScore) return aScore - bScore;
      return (a.quests?.title || "").localeCompare(b.quests?.title || "");
    });
  }, [rows, sort, myCity]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <section className="max-w-4xl mx-auto rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Joined Quests</h1>
          <Link href="/" className="border rounded px-3 py-2 text-sm">Back</Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Sort:</span>
          <button className={`border rounded px-3 py-1 text-sm ${sort === "closest" ? "bg-black text-white" : ""}`} onClick={() => setSort("closest")}>Closest</button>
          <button className={`border rounded px-3 py-1 text-sm ${sort === "starting_soon" ? "bg-black text-white" : ""}`} onClick={() => setSort("starting_soon")}>Almost start time</button>
          <button className={`border rounded px-3 py-1 text-sm ${sort === "recent" ? "bg-black text-white" : ""}`} onClick={() => setSort("recent")}>Recently joined</button>
        </div>

        {status && <p className="text-sm rounded border bg-amber-100 text-amber-900 border-amber-300 px-3 py-2">{status}</p>}

        <div className="space-y-2">
          <h2 className="font-semibold">Waiting on approval ({pending.length})</h2>
          {pending.length === 0 ? <p className="text-sm text-gray-500">No pending requests.</p> : pending.map((r) => (
            <Link key={`p-${r.quest_id}`} href={`/listing/${r.quest_id}`} className="block rounded-xl border bg-amber-50 px-3 py-2">
              <p className="font-medium">{r.quests?.title || "Untitled listing"}</p>
              <p className="text-xs text-gray-600">{r.quests?.city || locationSummary(r.quests?.exact_address) || "city tbd"} · {r.quests?.availability || "availability tbd"}</p>
            </Link>
          ))}
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">Approved ({approved.length})</h2>
          {loading ? <p>Loading...</p> : approved.length === 0 ? <p className="text-sm text-gray-500">You haven’t joined any approved quests yet.</p> : approved.map((r) => (
            <Link key={r.quest_id} href={`/listing/${r.quest_id}`} className="block rounded-xl border px-3 py-2 hover:bg-gray-50">
              <p className="font-medium">{r.quests?.title || "Untitled listing"}</p>
              <p className="text-xs text-gray-600">{r.quests?.city || locationSummary(r.quests?.exact_address) || "city tbd"} · {r.quests?.availability || "availability tbd"}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
