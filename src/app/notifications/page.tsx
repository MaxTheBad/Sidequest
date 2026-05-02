"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  kind: "message" | "join_request" | "approval" | "created";
  title: string;
  body: string;
  href: string;
  created_at: string;
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
        supabase.from("messages").select("id,quest_id,body,created_at,quests(title,creator_id)").or(`sender_id.eq.${uid},body.like.[PRIVATE to=${uid}] %,body.like.[PUBLIC] %`).order("created_at", { ascending: false }).limit(100),
        supabase.from("quest_members").select("quest_id,status,quests(title,city,availability)").eq("user_id", uid).in("status", ["pending", "approved"]).order("joined_at", { ascending: false }).limit(50),
      ]);

      const notifications: NotificationItem[] = [];
      (myMessages || []).forEach((row: any) => {
        const quest = Array.isArray(row.quests) ? row.quests[0] : row.quests;
        notifications.push({
          id: `msg-${row.id}`,
          kind: row.sender_id === uid ? "message" : "message",
          title: quest?.title || "Conversation",
          body: stripMessagePrefix(row.body || ""),
          href: quest?.id ? `/inbox` : "/inbox",
          created_at: row.created_at,
        });
      });
      (joinedRows || []).forEach((row: any) => {
        const quest = Array.isArray(row.quests) ? row.quests[0] : row.quests;
        notifications.push({
          id: `join-${row.quest_id}`,
          kind: row.status === "pending" ? "join_request" : "approval",
          title: quest?.title || "Joined quest",
          body: row.status === "pending" ? "Waiting for approval" : "You are in",
          href: row.quest_id ? `/listing/${row.quest_id}` : "/joined",
          created_at: row.created_at || new Date().toISOString(),
        });
      });
      (myQuests || []).forEach((row: any) => {
        notifications.push({
          id: `created-${row.id}`,
          kind: "created",
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

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity yet.</p>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <Link key={item.id} href={item.href} className="block rounded-2xl border px-4 py-3 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.body}</p>
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
