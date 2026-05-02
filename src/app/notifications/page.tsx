"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  kind: "message" | "join_request" | "approval" | "created";
  badge: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  senderName?: string | null;
  senderAvatar?: string | null;
};

function stripMessagePrefix(body: string) {
  if (body.startsWith("[PRIVATE")) return body.replace(/^\[PRIVATE(?:\s+to=[0-9a-fA-F-]{36})?\]\s?/, "");
  if (body.startsWith("[PUBLIC] ")) return body.replace("[PUBLIC] ", "");
  return body;
}

export default function NotificationsPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState<Array<"messages" | "comments" | "joined" | "your_listings">>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLastSeenAt(window.localStorage.getItem("sidequest_notifications_last_seen") || "");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const run = async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        if (typeof window !== "undefined") window.location.href = "/?auth=1";
        return;
      }

      const [{ data: myQuests }, { data: myMessages }, { data: joinedRows }] = await Promise.all([
        supabase.from("quests").select("id,title,created_at").eq("creator_id", uid).order("created_at", { ascending: false }).limit(50),
        supabase.from("messages").select("id,quest_id,sender_id,body,created_at,quests(id,title,creator_id),profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)").neq("sender_id", uid).order("created_at", { ascending: false }).limit(100),
        supabase.from("quest_members").select("quest_id,status,quests(title,city,availability)").eq("user_id", uid).in("status", ["pending", "approved"]).order("joined_at", { ascending: false }).limit(50),
      ]);

      const notifications: NotificationItem[] = [];
      (myMessages || []).forEach((row: any) => {
        const quest = Array.isArray(row.quests) ? row.quests[0] : row.quests;
        const sender = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        notifications.push({
          id: `msg-${row.id}`,
          kind: "message",
          badge: row.body?.startsWith("[PRIVATE") ? "Direct message" : "Public comment",
          title: quest?.title || "Conversation",
          body: stripMessagePrefix(row.body || ""),
          href: "/inbox",
          created_at: row.created_at,
          senderName: sender?.display_name || "Someone",
          senderAvatar: sender?.avatar_url || null,
        });
      });
      (joinedRows || []).forEach((row: any) => {
        const quest = Array.isArray(row.quests) ? row.quests[0] : row.quests;
        notifications.push({
          id: `join-${row.quest_id}`,
          kind: row.status === "pending" ? "join_request" : "approval",
          badge: row.status === "pending" ? "Join request" : "Joined",
          title: quest?.title || "Joined quest",
          body: row.status === "pending" ? "Waiting for host approval" : "You joined this quest",
          href: row.quest_id ? `/listing/${row.quest_id}` : "/joined",
          created_at: row.created_at || new Date().toISOString(),
        });
      });
      (myQuests || []).forEach((row: any) => {
        notifications.push({
          id: `created-${row.id}`,
          kind: "created",
          badge: "Your listing",
          title: row.title || "Your listing",
          body: "You created this quest",
          href: `/listing/${row.id}`,
          created_at: row.created_at,
        });
      });

      const deduped = Array.from(new Map(notifications.map((n) => [n.id, n])).values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setItems(deduped);
      setLoading(false);
    };
    void run();
  }, [supabase]);

  const unreadCount = useMemo(() => {
    if (!lastSeenAt) return items.length;
    const lastSeen = new Date(lastSeenAt).getTime();
    return items.filter((item) => new Date(item.created_at).getTime() > lastSeen).length;
  }, [items, lastSeenAt]);

  const grouped = useMemo(() => {
    const messages = items.filter((item) => item.kind === "message");
    const joins = items.filter((item) => item.kind === "join_request" || item.kind === "approval");
    const creations = items.filter((item) => item.kind === "created");
    return { messages, joins, creations };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (!activeFilters.length) return items;
    return items.filter((item) => {
      if (activeFilters.includes("messages") && item.kind === "message" && item.badge === "Direct message") return true;
      if (activeFilters.includes("comments") && item.kind === "message" && item.badge === "Public comment") return true;
      if (activeFilters.includes("joined") && (item.kind === "join_request" || item.kind === "approval")) return true;
      if (activeFilters.includes("your_listings") && item.kind === "created") return true;
      return false;
    });
  }, [items, activeFilters]);

  function toggleFilter(filter: "messages" | "comments" | "joined" | "your_listings") {
    setActiveFilters((prev) => prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]);
  }

  function clearFilters() {
    setActiveFilters([]);
  }

  function badgeTone(item: NotificationItem) {
    if (item.kind === "message" && item.badge === "Direct message") return "bg-blue-50 text-blue-700 border-blue-200";
    if (item.kind === "message" && item.badge === "Public comment") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (item.kind === "join_request") return "bg-amber-50 text-amber-700 border-amber-200";
    if (item.kind === "approval") return "bg-teal-50 text-teal-700 border-teal-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  }

  function markSeen() {
    if (typeof window === "undefined") return;
    const now = new Date().toISOString();
    window.localStorage.setItem("sidequest_notifications_last_seen", now);
    setLastSeenAt(now);
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <section className="max-w-4xl mx-auto rounded-3xl border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Activity</p>
            <h1 className="text-2xl font-semibold">Notifications</h1>
            <p className="text-sm text-gray-500">{unreadCount} new since you last checked.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="border rounded-full px-3 py-2 text-sm" onClick={markSeen}>Mark all seen</button>
            <Link href="/" className="border rounded-full px-3 py-2 text-sm">Back</Link>
          </div>
        </div>

        {status && <p className="text-sm rounded border bg-amber-100 text-amber-900 border-amber-300 px-3 py-2">{status}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={clearFilters} className={`rounded-full px-3 py-2 text-sm border ${activeFilters.length === 0 ? "bg-black text-white border-black" : "bg-white"}`}>
            All
          </button>
          <button type="button" onClick={() => toggleFilter("messages")} className={`rounded-full px-3 py-2 text-sm border ${activeFilters.includes("messages") ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}>
            Messages
          </button>
          <button type="button" onClick={() => toggleFilter("comments")} className={`rounded-full px-3 py-2 text-sm border ${activeFilters.includes("comments") ? "bg-emerald-600 text-white border-emerald-600" : "bg-white"}`}>
            Comments
          </button>
          <button type="button" onClick={() => toggleFilter("joined")} className={`rounded-full px-3 py-2 text-sm border ${activeFilters.includes("joined") ? "bg-amber-600 text-white border-amber-600" : "bg-white"}`}>
            Joined
          </button>
          <button type="button" onClick={() => toggleFilter("your_listings")} className={`rounded-full px-3 py-2 text-sm border ${activeFilters.includes("your_listings") ? "bg-slate-700 text-white border-slate-700" : "bg-white"}`}>
            Your listings
          </button>
        </div>
        {activeFilters.length > 0 ? <p className="text-xs text-gray-500">Showing {activeFilters.join(", ")}.</p> : null}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity yet.</p>
        ) : (
          <div className="grid gap-3">
            {visibleItems.map((item) => (
              <Link key={item.id} href={item.href} className="block rounded-2xl border px-4 py-3 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeTone(item)}`}>{item.badge}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {item.kind === "message" ? (
                        item.senderAvatar ? (
                          <img src={item.senderAvatar} alt={item.senderName || "Sender"} className="h-7 w-7 rounded-full object-cover border" />
                        ) : (
                          <div className="h-7 w-7 rounded-full border bg-gray-100 grid place-items-center text-[10px] text-gray-500">{(item.senderName || "S")[0]}</div>
                        )
                      ) : null}
                      <p className="text-sm font-semibold">{item.kind === "message" ? item.senderName : item.title}</p>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{item.kind === "message" ? item.body : item.body}</p>
                  </div>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{new Date(item.created_at).toLocaleString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
