"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Hobby = { name: string | null; category: string | null } | { name: string | null; category: string | null }[] | null;
type QuestRow = {
  id: string;
  creator_id: string;
  title: string | null;
  description: string | null;
  city: string | null;
  availability: string | null;
  exact_address: string | null;
  created_at: string | null;
  hobbies?: Hobby;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null;
};

function getQuestHobby(q?: { hobbies?: Hobby }) {
  if (!q?.hobbies) return null;
  return Array.isArray(q.hobbies) ? (q.hobbies[0] ?? null) : q.hobbies;
}

function getQuestCategoryDisplay(q: QuestRow) {
  const hobby = getQuestHobby(q);
  const name = hobby?.name?.trim();
  const category = hobby?.category?.trim();
  return [name, category].find((value) => value && !/^(category|hobby|custom)$/i.test(value)) || "Category";
}

function getQuestCityLabel(q: QuestRow) {
  const raw = (q.city || q.exact_address || "").trim();
  if (!raw) return "City tbd";
  return raw.replace(/,\s*(Florida|FL)$/i, ", FL").replace(/\bUnited States\b/i, "US");
}

function getPostedLabel(createdAt?: string | null) {
  if (!createdAt) return "Posted recently";
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Posted recently";
  const diffHours = (Date.now() - created.getTime()) / (60 * 60 * 1000);
  if (diffHours < 24) return `Posted ${Math.max(1, Math.round(diffHours * 60))}m ago`;
  if (diffHours < 24 * 7) return `Posted ${created.toLocaleDateString(undefined, { weekday: "short" })}`;
  return `Posted ${created.toLocaleString(undefined, { month: "short", day: "numeric" })}`;
}

export default function SavedPage() {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<QuestRow[]>([]);

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

      const { data: bookmarks, error: bookmarkErr } = await supabase
        .from("quest_bookmarks")
        .select("quest_id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (bookmarkErr) {
        setLoading(false);
        setStatus(bookmarkErr.message);
        return;
      }

      const questIds = ((bookmarks || []) as Array<{ quest_id: string }>).map((row) => row.quest_id);
      if (!questIds.length) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: questsData, error: questsErr } = await supabase
        .from("quests")
        .select("id,creator_id,title,description,city,availability,exact_address,created_at,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
        .in("id", questIds);

      setLoading(false);
      if (questsErr) {
        setStatus(questsErr.message);
        return;
      }

      const lookup = new Map((questsData || []).map((q) => [(q as QuestRow).id, q as QuestRow]));
      setRows(questIds.map((id) => lookup.get(id)).filter((q): q is QuestRow => !!q));
    };
    void run();
  }, [supabase]);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  return (
    <main className="page-shell page-saved min-h-screen bg-transparent px-4 pb-24 pt-10 md:pt-14">
      <section className="mx-auto w-full max-w-4xl space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Saved</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Your saved listings</h1>
            <p className="mt-1 text-sm text-gray-500">All listings you bookmarked live here as their own page.</p>
          </div>
          <Link href="/" className="rounded-full border bg-white px-4 py-2 text-sm text-slate-900 shadow-sm">
            Back
          </Link>
        </div>

        {status ? <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{status}</p> : null}

        {loading ? <p className="text-sm text-gray-500">Loading saved listings...</p> : null}
        {empty ? <p className="text-sm text-gray-500">No saved listings yet.</p> : null}

        <div className="space-y-3">
          {rows.map((q) => (
            <Link key={q.id} href={`/listing/${q.id}`} className="block overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:shadow-md">
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getQuestCategoryDisplay(q)}</p>
                    <h2 className="mt-1 line-clamp-2 text-xl font-semibold tracking-tight text-slate-950">{q.title || "Untitled listing"}</h2>
                  </div>
                  <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{getQuestCityLabel(q)}</div>
                </div>
                <p className="mt-2 text-sm text-slate-600 line-clamp-2">{q.description || "No description yet."}</p>
                <p className="mt-3 text-xs text-slate-500">{getPostedLabel(q.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
