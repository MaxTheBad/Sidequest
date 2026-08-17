"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { AppIcon } from "@/components/app-icons";

type QuestInfo = {
  id: string;
  title: string | null;
  city: string | null;
  availability: string | null;
  starts_at: string | null;
  exact_address?: string | null;
  hobby_id?: string | null;
  hobbies?: { name: string | null }[] | null;
};

type JoinedQuest = {
  quest_id: string;
  role: "creator" | "cohost" | "member";
  status: "pending" | "approved" | "declined";
  joined_at?: string | null;
  quests?: QuestInfo | null;
};

type JoinedQuestRow = {
  quest_id: string;
  role?: "creator" | "cohost" | "member" | null;
  status?: "pending" | "approved" | "declined" | null;
  joined_at?: string | null;
  quests?: QuestInfo | QuestInfo[] | null;
};

type SortMode = "closest" | "starting_soon" | "recent";
type CollectionView = "active" | "completed";

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
  const [search, setSearch] = useState("");
  const [collectionView, setCollectionView] = useState<CollectionView>("active");
  const [collectionNow, setCollectionNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setCollectionNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
        .select("quest_id,role,status,joined_at,quests(id,title,city,availability,starts_at,exact_address,hobbies(name))")
        .eq("user_id", uid)
        .in("status", ["approved", "pending"])
        .order("joined_at", { ascending: false });

      setLoading(false);
      if (error) return setStatus(error.message);

      const normalized = ((data || []) as JoinedQuestRow[]).map((row) => ({
        quest_id: row.quest_id,
        role: (row.role || "member") as "creator" | "cohost" | "member",
        status: (row.status || "approved") as "pending" | "approved" | "declined",
        joined_at: row.joined_at || null,
        quests: Array.isArray(row.quests) ? (row.quests[0] || null) : (row.quests || null),
      }));

      setRows(normalized);
    };
    void run();
  }, [supabase]);

  const scopedRows = useMemo(() => {
    return rows.filter((row) => {
      const startsAt = row.quests?.starts_at ? new Date(row.quests.starts_at).getTime() : null;
      const completed = startsAt !== null && startsAt <= collectionNow;
      return collectionView === "completed" ? completed : !completed;
    });
  }, [rows, collectionView, collectionNow]);

  const hosting = useMemo(() => scopedRows.filter((r) => (r.status || "approved") === "approved" && (r.role === "creator" || r.role === "cohost")), [scopedRows]);
  const pending = useMemo(() => collectionView === "active" ? scopedRows.filter((r) => (r.status || "approved") === "pending" && r.role === "member") : [], [scopedRows, collectionView]);

  const approved = useMemo(() => {
    const list = scopedRows.filter((r) => (r.status || "approved") === "approved" && r.role === "member");
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
  }, [scopedRows, sort, myCity]);

  const matchesSearch = (row: JoinedQuest) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [row.quests?.title, row.quests?.city, row.quests?.availability, row.quests?.hobbies?.[0]?.name]
      .some((value) => (value || "").toLowerCase().includes(query));
  };
  const visibleHosting = hosting.filter(matchesSearch);
  const visiblePending = pending.filter(matchesSearch);
  const visibleApproved = approved.filter(matchesSearch);
  const collectionCounts = rows.reduce((counts, row) => {
    const startsAt = row.quests?.starts_at ? new Date(row.quests.starts_at).getTime() : null;
    const key: CollectionView = startsAt !== null && startsAt <= collectionNow ? "completed" : "active";
    counts[key] += 1;
    return counts;
  }, { active: 0, completed: 0 });

  return (
    <main className="page-shell page-joined app-page min-h-screen bg-transparent p-4">
      <section className="max-w-4xl mx-auto rounded-2xl border bg-white p-4 space-y-4 app-page-card">
        <div className="flex items-center justify-between app-page-header">
          <div><p className="app-kicker">Your plans</p><h1 className="text-xl font-bold">Your Quests</h1><p className="app-page-subtitle">Active plans and a history of completed quests.</p></div>
          <Link href="/" className="border rounded px-3 py-2 text-sm">Discover</Link>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/5" aria-label="Quest history view">
          {(["active", "completed"] as CollectionView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setCollectionView(view)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${collectionView === view ? "bg-[#9bd8e4] text-[#082f3a] shadow-sm" : "text-slate-500 dark:text-slate-300"}`}
            >
              {view === "active" ? "Active" : "Completed"}
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px]">{collectionCounts[view]}</span>
            </button>
          ))}
        </div>

        <div className="app-search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your quests" aria-label="Search joined quests" /></div>

        <div className="flex flex-wrap items-center gap-2 app-filter-chips">
          <span className="text-sm text-gray-600">Sort:</span>
          <button className={`border rounded px-3 py-1 text-sm ${sort === "closest" ? "bg-black text-white" : ""}`} onClick={() => setSort("closest")}>Closest</button>
          <button className={`border rounded px-3 py-1 text-sm ${sort === "starting_soon" ? "bg-black text-white" : ""}`} onClick={() => setSort("starting_soon")}>Almost start time</button>
          <button className={`border rounded px-3 py-1 text-sm ${sort === "recent" ? "bg-black text-white" : ""}`} onClick={() => setSort("recent")}>Recently joined</button>
        </div>

        {status && <p className="text-sm rounded border bg-amber-100 text-amber-900 border-amber-300 px-3 py-2">{status}</p>}

        <div className="space-y-2 app-quest-collection">
          <h2 className="font-semibold">{collectionView === "completed" ? "Hosted" : "Hosting"} <span>{visibleHosting.length}</span></h2>
          {visibleHosting.length === 0 ? <p className="text-sm text-gray-500">No matching {collectionView} hosted quests.</p> : visibleHosting.map((r) => (
            <Link key={`h-${r.quest_id}`} href={`/listing/${r.quest_id}`} className={`relative block overflow-hidden rounded-xl border bg-emerald-50 px-3 py-2 app-joined-card is-hosting ${collectionView === "completed" ? "grayscale opacity-75" : ""}`}>
              {collectionView === "completed" ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 -rotate-6 rounded border-2 border-slate-500/70 px-2 py-1 text-[10px] font-black tracking-[0.16em] text-slate-600">COMPLETED</span> : null}
              <p className="flex items-center gap-2 font-medium"><AppIcon name="star" className="h-4 w-4 text-amber-500" /> {r.quests?.title || "Untitled listing"}</p>
              <p className="text-xs text-gray-600">{r.role === "creator" ? "Organizer" : "Co-host"} · {r.quests?.city || locationSummary(r.quests?.exact_address) || "city tbd"} · {r.quests?.availability || "availability tbd"}</p>
            </Link>
          ))}
        </div>

        {collectionView === "active" ? <div className="space-y-2 app-quest-collection">
          <h2 className="font-semibold">Waiting on approval <span>{visiblePending.length}</span></h2>
          {visiblePending.length === 0 ? <p className="text-sm text-gray-500">No matching pending requests.</p> : visiblePending.map((r) => (
            <Link key={`p-${r.quest_id}`} href={`/listing/${r.quest_id}`} className="block rounded-xl border bg-amber-50 px-3 py-2 app-joined-card is-pending">
              <p className="font-medium">{r.quests?.title || "Untitled listing"}</p>
              <p className="text-xs text-gray-600">{r.quests?.city || locationSummary(r.quests?.exact_address) || "city tbd"} · {r.quests?.availability || "availability tbd"}</p>
            </Link>
          ))}
        </div> : null}

        <div className="space-y-2 app-quest-collection">
          <h2 className="font-semibold">{collectionView === "completed" ? "Previously joined" : "Joined"} <span>{visibleApproved.length}</span></h2>
          {loading ? <p>Loading...</p> : visibleApproved.length === 0 ? <p className="text-sm text-gray-500">No matching {collectionView} joined quests.</p> : visibleApproved.map((r) => (
            <Link key={r.quest_id} href={`/listing/${r.quest_id}`} className={`relative block overflow-hidden rounded-xl border px-3 py-2 hover:bg-gray-50 app-joined-card ${collectionView === "completed" ? "grayscale opacity-75" : ""}`}>
              {collectionView === "completed" ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 -rotate-6 rounded border-2 border-slate-500/70 px-2 py-1 text-[10px] font-black tracking-[0.16em] text-slate-600">COMPLETED</span> : null}
              <p className="font-medium">{r.quests?.title || "Untitled listing"}</p>
              <p className="text-xs text-gray-600">{r.quests?.city || locationSummary(r.quests?.exact_address) || "city tbd"} · {r.quests?.availability || "availability tbd"}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
