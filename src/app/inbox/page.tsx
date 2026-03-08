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
};

type RawInboxMessage = {
  id: string;
  quest_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  quests?: { title: string | null; creator_id: string | null }[] | { title: string | null; creator_id: string | null } | null;
};

function normalizeMessageRow(row: RawInboxMessage): InboxMessage {
  const quest = Array.isArray(row.quests) ? (row.quests[0] ?? null) : (row.quests ?? null);
  return {
    id: row.id,
    quest_id: row.quest_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
    quests: quest,
  };
}

export default function InboxPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const loadInbox = useCallback(async (uid: string) => {
    if (!supabase) return;
    setLoading(true);

    const { data: createdQuests } = await supabase.from("quests").select("id").eq("creator_id", uid);
    const createdQuestIds = (createdQuests || []).map((q) => q.id);

    const [sentRes, receivedRes] = await Promise.all([
      supabase
        .from("messages")
        .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id)")
        .eq("sender_id", uid)
        .order("created_at", { ascending: false })
        .limit(200),
      createdQuestIds.length
        ? supabase
            .from("messages")
            .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id)")
            .in("quest_id", createdQuestIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (sentRes.error) {
      setStatus(sentRes.error.message);
      setLoading(false);
      return;
    }
    if (receivedRes.error) {
      setStatus(receivedRes.error.message);
      setLoading(false);
      return;
    }

    const sentRows = ((sentRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const receivedRows = ((receivedRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const merged = [...sentRows, ...receivedRows];
    const dedupedMap = new Map<string, InboxMessage>();
    merged.forEach((m) => dedupedMap.set(m.id, m));
    const deduped = Array.from(dedupedMap.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    setMessages(deduped);
    setActiveQuestId((prev) => prev || deduped[0]?.quest_id || null);
    setLoading(false);
  }, [supabase]);

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

  const threads = useMemo(() => {
    const map = new Map<string, { questId: string; title: string; lastMessageAt: string; preview: string }>();
    for (const m of messages) {
      if (!map.has(m.quest_id)) {
        map.set(m.quest_id, {
          questId: m.quest_id,
          title: m.quests?.title || "Untitled listing",
          lastMessageAt: m.created_at,
          preview: m.body,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  }, [messages]);

  const activeMessages = useMemo(() => messages.filter((m) => m.quest_id === activeQuestId).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)), [messages, activeQuestId]);

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId || !activeQuestId || !draft.trim()) return;

    const { error } = await supabase.from("messages").insert({
      quest_id: activeQuestId,
      sender_id: userId,
      body: draft.trim(),
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

        <div className="grid md:grid-cols-[320px_1fr] gap-3">
          <aside className="rounded-2xl border bg-white p-2 max-h-[70vh] overflow-auto">
            {loading ? <p className="p-3 text-sm">Loading...</p> : threads.length === 0 ? <p className="p-3 text-sm text-gray-500">No messages yet.</p> : threads.map((t) => (
              <button
                key={t.questId}
                className={`w-full text-left rounded-xl px-3 py-2 border mb-2 ${activeQuestId === t.questId ? "bg-black text-white" : "bg-white"}`}
                onClick={() => setActiveQuestId(t.questId)}
                type="button"
              >
                <p className="font-medium truncate">{t.title}</p>
                <p className={`text-xs truncate ${activeQuestId === t.questId ? "text-white/80" : "text-gray-500"}`}>{t.preview}</p>
              </button>
            ))}
          </aside>

          <section className="rounded-2xl border bg-white p-3 flex flex-col h-[70vh]">
            <div className="flex-1 overflow-auto space-y-2 pr-1">
              {activeMessages.length === 0 ? (
                <p className="text-sm text-gray-500">Pick a thread to view messages.</p>
              ) : (
                activeMessages.map((m) => {
                  const mine = m.sender_id === userId;
                  return (
                    <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? "ml-auto bg-black text-white" : "bg-gray-100"}`}>
                      <p>{m.body}</p>
                      <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-gray-500"}`}>{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={sendReply} className="mt-3 flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2"
                placeholder={activeQuestId ? "Write a reply..." : "Select a thread to reply"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!activeQuestId}
              />
              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={!activeQuestId || !draft.trim()}>Send</button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
