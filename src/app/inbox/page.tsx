"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type InboxMessage = {
  id: string;
  quest_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  quests?: { title: string | null; creator_id: string | null } | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type RawInboxMessage = {
  id: string;
  quest_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  quests?: { title: string | null; creator_id: string | null }[] | { title: string | null; creator_id: string | null } | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type ThreadKind = "public" | "private";

type Thread = {
  id: string;
  questId: string;
  kind: ThreadKind;
  title: string;
  lastMessageAt: string;
  preview: string;
};

function normalizeMessageRow(row: RawInboxMessage): InboxMessage {
  const quest = Array.isArray(row.quests) ? (row.quests[0] ?? null) : (row.quests ?? null);
  const profile = Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : (row.profiles ?? null);
  return {
    id: row.id,
    quest_id: row.quest_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
    quests: quest,
    profiles: profile,
  };
}

function getMessagePrivacy(body: string): ThreadKind {
  if (body.startsWith("[PRIVATE] ")) return "private";
  return "public";
}

function getMessageText(body: string) {
  if (body.startsWith("[PRIVATE] ")) return body.replace("[PRIVATE] ", "");
  if (body.startsWith("[PUBLIC] ")) return body.replace("[PUBLIC] ", "");
  return body;
}

export default function InboxPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const loadInbox = useCallback(async (uid: string) => {
    if (!supabase) return;
    setLoading(true);

    const [{ data: createdQuests }, { data: joinedRows }] = await Promise.all([
      supabase.from("quests").select("id").eq("creator_id", uid),
      supabase.from("quest_members").select("quest_id").eq("user_id", uid),
    ]);

    const createdQuestIds = (createdQuests || []).map((q) => q.id);
    const joinedQuestIds = ((joinedRows || []) as Array<{ quest_id: string }>).map((r) => r.quest_id);
    const participantQuestIds = Array.from(new Set([...createdQuestIds, ...joinedQuestIds]));

    const [sentRes, participantRes] = await Promise.all([
      supabase
        .from("messages")
        .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id),profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
        .eq("sender_id", uid)
        .order("created_at", { ascending: false })
        .limit(300),
      participantQuestIds.length
        ? supabase
            .from("messages")
            .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id),profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
            .in("quest_id", participantQuestIds)
            .order("created_at", { ascending: false })
            .limit(300)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (sentRes.error) {
      setStatus(sentRes.error.message);
      setLoading(false);
      return;
    }
    if (participantRes.error) {
      setStatus(participantRes.error.message);
      setLoading(false);
      return;
    }

    const sentRows = ((sentRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const participantRows = ((participantRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const merged = [...sentRows, ...participantRows];
    const dedupedMap = new Map<string, InboxMessage>();
    merged.forEach((m) => dedupedMap.set(m.id, m));
    const deduped = Array.from(dedupedMap.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    setMessages(deduped);

    if (!activeThreadId && deduped[0]) {
      const firstKind = getMessagePrivacy(deduped[0].body);
      setActiveThreadId(`${deduped[0].quest_id}:${firstKind}`);
    }

    setLoading(false);
  }, [supabase, activeThreadId]);

  useEffect(() => {
    if (!supabase) return;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      if (uid) await loadInbox(uid);
      setLoading(false);
    };

    void init();
  }, [supabase, loadInbox]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const ch = supabase
      .channel(`inbox-live-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void loadInbox(userId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, userId, loadInbox]);

  const threads = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of messages) {
      const kind = getMessagePrivacy(m.body);
      const id = `${m.quest_id}:${kind}`;
      if (!map.has(id)) {
        map.set(id, {
          id,
          questId: m.quest_id,
          kind,
          title: `${m.quests?.title || "Untitled listing"} · ${kind === "private" ? "Private" : "Public"}`,
          lastMessageAt: m.created_at,
          preview: getMessageText(m.body),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  }, [messages]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) || null, [threads, activeThreadId]);

  const activeMessages = useMemo(() => {
    if (!activeThread) return [];
    return messages
      .filter((m) => m.quest_id === activeThread.questId && getMessagePrivacy(m.body) === activeThread.kind)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  }, [messages, activeThread]);

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId || !activeThread || !draft.trim()) return;

    const prefix = activeThread.kind === "private" ? "[PRIVATE] " : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: activeThread.questId,
      sender_id: userId,
      body: `${prefix}${draft.trim()}`,
    });
    if (error) return setStatus(error.message);

    setDraft("");
    await loadInbox(userId);
  }

  if (!supabase) return <main className="min-h-screen bg-[#f6f7fb] p-4">Missing Supabase config.</main>;

  if (!userId && !loading) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] p-4">
        <div className="max-w-3xl mx-auto rounded-2xl border bg-white p-6">
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="mt-2 text-sm text-gray-600">Please log in from the home page first to view messages.</p>
          <Link href="/" className="inline-block mt-4 border rounded px-3 py-2">Go home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Inbox</h1>
          <div className="flex gap-2">
            <Link href="/" className="border rounded px-3 py-2">Back to listings</Link>
            <button className="border rounded px-3 py-2" onClick={() => userId && void loadInbox(userId)}>Refresh</button>
          </div>
        </div>

        {status && <div className="mb-3 rounded border bg-amber-50 px-3 py-2 text-sm">{status}</div>}

        <div className="grid md:grid-cols-[340px_1fr] gap-3">
          <aside className="rounded-2xl border bg-white p-2 max-h-[70vh] overflow-auto">
            {loading ? <p className="p-3 text-sm">Loading...</p> : threads.length === 0 ? <p className="p-3 text-sm text-gray-500">No messages yet.</p> : threads.map((t) => (
              <button
                key={t.id}
                className={`w-full text-left rounded-xl px-3 py-2 border mb-2 ${activeThreadId === t.id ? "bg-black text-white" : "bg-white"}`}
                onClick={() => setActiveThreadId(t.id)}
                type="button"
              >
                <p className="font-medium truncate">{t.title}</p>
                <Link
                  href={`/listing/${t.questId}`}
                  className={`text-[11px] underline ${activeThreadId === t.id ? "text-white/90" : "text-gray-500"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  View listing
                </Link>
                <p className={`text-xs truncate ${activeThreadId === t.id ? "text-white/80" : "text-gray-500"}`}>{t.preview}</p>
              </button>
            ))}
          </aside>

          <section className="rounded-2xl border bg-white p-3 flex flex-col h-[70vh]">
            {activeThread && (
              <div className="mb-2 pb-2 border-b text-sm flex items-center justify-between">
                <span className={`px-2 py-1 rounded ${activeThread.kind === "private" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {activeThread.kind === "private" ? "Private conversation" : "Public conversation"}
                </span>
                <Link href={`/listing/${activeThread.questId}`} className="underline">Open listing</Link>
              </div>
            )}

            <div className="flex-1 overflow-auto space-y-2 pr-1">
              {activeMessages.length === 0 ? (
                <p className="text-sm text-gray-500">Pick a thread to view messages.</p>
              ) : (
                activeMessages.map((m) => {
                  const mine = m.sender_id === userId;
                  const privacy = getMessagePrivacy(m.body);
                  return (
                    <div key={m.id} className={`max-w-[86%] rounded-xl px-3 py-2 text-sm ${mine ? "ml-auto bg-black text-white" : "bg-gray-100"}`}>
                      {!mine && privacy === "public" && (
                        <div className="flex items-center gap-2 mb-1">
                          {m.profiles?.avatar_url ? (
                            <img src={m.profiles.avatar_url} alt={m.profiles.display_name || "User"} className="h-5 w-5 rounded-full object-cover border" />
                          ) : (
                            <div className="h-5 w-5 rounded-full bg-white border" />
                          )}
                          <Link href={`/profile/${m.sender_id}`} className="text-[11px] underline text-gray-600">
                            {m.profiles?.display_name || "Member"}
                          </Link>
                        </div>
                      )}
                      <p>{getMessageText(m.body)}</p>
                      <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-gray-500"}`}>{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={sendReply} className="mt-3 flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2"
                placeholder={activeThread ? `Reply in ${activeThread.kind} thread...` : "Select a thread to reply"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!activeThread}
              />
              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={!activeThread || !draft.trim()}>Send</button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
