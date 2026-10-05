"use client";

import Link from "next/link";
import { AppIcon } from "@/components/app-icons";
import { PeopleFinder, type DiscoveryQuest } from "@/components/people-finder";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatActivityTime } from "@/lib/activity-time";
import { getSupabaseClient } from "@/lib/supabase";

type InboxMessage = {
  id: string;
  quest_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  quests?: { title: string | null; creator_id: string | null; media_video_url?: string | null; media_items?: Array<{ url: string; type: "image" | "video"; label?: string | null }> | null } | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type RawInboxMessage = {
  id: string;
  quest_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  quests?: { title: string | null; creator_id: string | null; media_video_url?: string | null; media_items?: Array<{ url: string; type: "image" | "video"; label?: string | null }> | null }[] | { title: string | null; creator_id: string | null; media_video_url?: string | null; media_items?: Array<{ url: string; type: "image" | "video"; label?: string | null }> | null } | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type ThreadKind = "public" | "private";

type Thread = {
  id: string;
  questId: string;
  kind: ThreadKind;
  partnerId?: string | null;
  partnerName?: string | null;
  partnerAvatar?: string | null;
  title: string;
  questTitle: string;
  lastMessageAt: string;
  preview: string;
  mediaVideoUrl?: string | null;
  mediaFallbackUrl?: string | null;
  mediaItems?: Array<{ url: string; type: "image" | "video"; label?: string | null }>;
};

type QuestOwnerLite = { creator_id: string | null; display_name: string | null; avatar_url: string | null };
type HostedQuestLite = DiscoveryQuest;
type QuestInvitation = {
  id: string;
  message: string | null;
  created_at: string;
  quests?: { id: string; title: string | null }[] | { id: string; title: string | null } | null;
  sender?: { display_name: string | null; avatar_url: string | null }[] | { display_name: string | null; avatar_url: string | null } | null;
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
  if (body.startsWith("[PRIVATE")) return "private";
  return "public";
}

function getPrivateRecipientId(body: string): string | null {
  const match = body.match(/^\[PRIVATE(?:\s+to=([0-9a-fA-F-]{36}))?\]\s?/);
  return match?.[1] || null;
}

function getMessageText(body: string) {
  if (body.startsWith("[PRIVATE")) return body.replace(/^\[PRIVATE(?:\s+to=[0-9a-fA-F-]{36})?\]\s?/, "");
  if (body.startsWith("[PUBLIC] ")) return body.replace("[PUBLIC] ", "");
  return body;
}

function getInitial(name?: string | null) {
  const s = (name || "?").trim();
  return s ? s[0]!.toUpperCase() : "?";
}

function getTypingChannelKey(thread: Thread | null, currentUserId: string | null) {
  if (!thread) return null;
  if (thread.kind === "public") return `typing:${thread.questId}:public`;
  if (!currentUserId || !thread.partnerId) return null;
  const pair = [currentUserId, thread.partnerId].sort().join(":");
  return `typing:${thread.questId}:private:${pair}`;
}

export default function InboxPage() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSendMs, setLastSendMs] = useState(0);
  const [userName, setUserName] = useState("You");
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSendRef = useRef(0);
  const [partnerProfiles, setPartnerProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});
  const [questOwners, setQuestOwners] = useState<Record<string, QuestOwnerLite>>({});
  const [hostedQuests, setHostedQuests] = useState<HostedQuestLite[]>([]);
  const [peopleQuestId, setPeopleQuestId] = useState<string | null>(null);
  const [showPeopleFinder, setShowPeopleFinder] = useState(false);
  useEffect(() => {
    const sync = () => { const id = new URLSearchParams(window.location.search).get("people"); setPeopleQuestId(id === "choose" ? null : id); setShowPeopleFinder(Boolean(id)); };
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function openPeopleFinder(quest?: HostedQuestLite) {
    const url = new URL(window.location.href); url.searchParams.set("people", quest?.id || "choose");
    window.history.pushState({ ...window.history.state, inboxPeopleFinder: true }, "", url.pathname + url.search);
    setPeopleQuestId(quest?.id || null); setShowPeopleFinder(true);
  }
  function closePeopleFinder() {
    if (window.history.state?.inboxPeopleFinder) window.history.back();
    else { const url = new URL(window.location.href); url.searchParams.delete("people"); window.history.replaceState(window.history.state, "", url.pathname + url.search); setShowPeopleFinder(false); setPeopleQuestId(null); }
  }
  const peopleQuest = hostedQuests.find(quest => quest.id === peopleQuestId) || null;
  const [questInvitations, setQuestInvitations] = useState<QuestInvitation[]>([]);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const messagesSigRef = useRef("");
  const ownersSigRef = useRef("");
  const didAutoSelectRef = useRef(false);
  const messagesPaneRef = useRef<HTMLDivElement | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newIncomingCount, setNewIncomingCount] = useState(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastIncomingIdRef = useRef<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState("");
  const pendingThreadTargetRef = useRef<{ thread: string | null; message: string | null } | null>(null);

  const loadInbox = useCallback(async (uid: string, silent = false) => {
    if (!supabase) return;
    if (!silent) setLoading(true);

    const [hostedRes, sentRes, blockRes, invitationRes] = await Promise.all([
      supabase.from("quests").select("id,title,creator_id").eq("creator_id", uid).order("starts_at", { ascending: true }).limit(10),
      supabase
        .from("messages")
        .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id,media_video_url,media_items),profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
        .eq("sender_id", uid)
        .like("body", "[PRIVATE%")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("friends").select("requester_id,addressee_id,status").eq("status", "blocked").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      supabase.from("quest_invitations").select("id,message,created_at,quests(id,title),sender:profiles!quest_invitations_sender_id_fkey(display_name,avatar_url)").eq("recipient_id", uid).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    if (!invitationRes.error) setQuestInvitations((invitationRes.data || []) as QuestInvitation[]);

    if (hostedRes.error) setStatus(`Your hosted quests could not be loaded: ${hostedRes.error.message}`);
    const ownedListings = ((hostedRes.data || []) as HostedQuestLite[]).filter(quest => quest.creator_id === uid);
    setHostedQuests(ownedListings);
    const ownerQuestIds = ownedListings.map((q) => q.id);
    const privateRes = ownerQuestIds.length
      ? await supabase
          .from("messages")
          .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id,media_video_url,media_items),profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
          .in("quest_id", ownerQuestIds)
          .like("body", "[PRIVATE%")
          .order("created_at", { ascending: false })
          .limit(300)
      : { data: [], error: null };

    const privateForMeRes = await supabase
      .from("messages")
      .select("id,quest_id,sender_id,body,created_at,quests(title,creator_id,media_video_url,media_items),profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
      .like("body", `[PRIVATE to=${uid}] %`)
      .order("created_at", { ascending: false })
      .limit(300);

    if (sentRes.error) {
      setStatus(sentRes.error.message);
      if (!silent) setLoading(false);
      return;
    }
    if (privateRes.error) {
      setStatus(privateRes.error.message);
      if (!silent) setLoading(false);
      return;
    }
    if (privateForMeRes.error) {
      setStatus(privateForMeRes.error.message);
      if (!silent) setLoading(false);
      return;
    }

    const sentRows = ((sentRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const privateRows = ((privateRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const privateForMeRows = ((privateForMeRes.data || []) as RawInboxMessage[]).map(normalizeMessageRow);
    const blocked = Array.from(new Set(((blockRes.data || []) as Array<{ requester_id: string; addressee_id: string }>).flatMap((r) => [r.requester_id, r.addressee_id]).filter((id) => id !== uid)));

    const merged = [...sentRows, ...privateRows, ...privateForMeRows].filter((m) => !blocked.includes(m.sender_id) && !blocked.includes(getPrivateRecipientId(m.body) || ""));
    const dedupedMap = new Map<string, InboxMessage>();
    merged.forEach((m) => dedupedMap.set(m.id, m));
    const deduped = Array.from(dedupedMap.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    const nextMsgSig = deduped.map((m) => `${m.id}:${m.created_at}:${m.body}`).join("|");
    if (nextMsgSig !== messagesSigRef.current) {
      messagesSigRef.current = nextMsgSig;
      setMessages(deduped);
    }

    const partnerIds = [...new Set(deduped.flatMap(message => [message.sender_id, getPrivateRecipientId(message.body)]).filter((id): id is string => Boolean(id && id !== uid)))];
    if (partnerIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,avatar_url").in("id", partnerIds);
      if (profiles) setPartnerProfiles(Object.fromEntries(profiles.map(profile => [profile.id, profile])));
    }
    const questIds = Array.from(new Set(deduped.map((m) => m.quest_id).filter(Boolean)));
    if (questIds.length) {
      const { data: ownerRows } = await supabase
        .from("quests")
        .select("id,creator_id,profiles:profiles!quests_creator_id_fkey(display_name,avatar_url)")
        .in("id", questIds);

      const ownerMap: Record<string, QuestOwnerLite> = {};
      ((ownerRows as Array<{ id: string; creator_id: string | null; profiles?: { display_name: string | null; avatar_url: string | null }[] | { display_name: string | null; avatar_url: string | null } | null }> | null) || []).forEach((r) => {
        const p = Array.isArray(r.profiles) ? (r.profiles[0] || null) : (r.profiles || null);
        ownerMap[r.id] = { creator_id: r.creator_id, display_name: p?.display_name || null, avatar_url: p?.avatar_url || null };
      });
      const nextOwnerSig = JSON.stringify(ownerMap);
      if (nextOwnerSig !== ownersSigRef.current) {
        ownersSigRef.current = nextOwnerSig;
        setQuestOwners(ownerMap);
      }
    }

    if (!silent) setLoading(false);
  }, [supabase, activeThreadId]);

  async function respondToInvitation(invitationId: string, accept: boolean) {
    if (!supabase || !userId || invitationActionId) return;
    setInvitationActionId(invitationId);
    const { error } = await supabase.rpc("respond_to_quest_invitation", { p_invitation_id: invitationId, p_accept: accept });
    setInvitationActionId(null);
    if (error) return setStatus(error.message);
    setQuestInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
    setStatus(accept ? "Invitation accepted. You are approved for the quest." : "Invitation declined.");
  }

  useEffect(() => {
    if (!supabase) return;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      const u = data.session?.user;
      setUserId(uid);
      const nm = (u?.user_metadata?.full_name as string | undefined) || (u?.user_metadata?.name as string | undefined) || u?.email || "You";
      setUserName(nm.toString().split("@")[0]);
      if (uid) await loadInbox(uid, false);
      setLoading(false);
    };

    void init();
  }, [supabase, loadInbox]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const ch = supabase
      .channel(`inbox-live-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void loadInbox(userId, true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, userId, loadInbox]);

  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => {
      void loadInbox(userId, true);
    }, 5000);
    const onFocus = () => void loadInbox(userId, true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, loadInbox]);

  // typing channel effect is declared after activeThread

  const threads = useMemo(() => {
    const profileBySender = new Map<string, { name: string; avatar: string | null }>();
    for (const m of messages) {
      if (!m.sender_id) continue;
      profileBySender.set(m.sender_id, {
        name: m.profiles?.display_name || "Member",
        avatar: m.profiles?.avatar_url || null,
      });
    }

    const map = new Map<string, Thread>();
    for (const m of messages) {
      const kind = getMessagePrivacy(m.body);
      const recipientId = getPrivateRecipientId(m.body);
      const partnerId = kind === "private"
        ? (m.sender_id === userId ? (recipientId || m.quests?.creator_id || null) : m.sender_id)
        : null;
      const id = kind === "private" ? `${m.quest_id}:${kind}:${partnerId || "unknown"}` : `${m.quest_id}:${kind}`;
      if (!map.has(id)) {
        const owner = questOwners[m.quest_id];
        const senderProfile = partnerId ? profileBySender.get(partnerId) : null;
        const fetchedProfile = partnerId ? partnerProfiles[partnerId] : null;
        const partnerProfile = fetchedProfile ? { name: fetchedProfile.display_name, avatar: fetchedProfile.avatar_url } : senderProfile;
        const ownerIsPartner = !!(partnerId && owner?.creator_id && partnerId === owner.creator_id);
        const partnerName = kind === "private"
          ? (partnerProfile?.name || (ownerIsPartner ? (owner?.display_name || "Listing owner") : (m.sender_id === userId ? "QuestHat member" : (m.profiles?.display_name || "Member"))))
          : null;
        const partnerAvatar = kind === "private"
          ? (partnerProfile?.avatar || (ownerIsPartner ? (owner?.avatar_url || null) : (m.sender_id === userId ? null : (m.profiles?.avatar_url || null))))
          : null;
        const mediaItems = [
          ...(m.quests?.media_video_url ? [{ url: m.quests.media_video_url, type: "video" as const, label: "Listing video" }] : []),
          ...((m.quests?.media_items || []) as Array<{ url: string; type: "image" | "video"; label?: string | null }>),
        ];
        map.set(id, {
          id,
          questId: m.quest_id,
          kind,
          partnerId,
          partnerName,
          partnerAvatar,
          questTitle: m.quests?.title || "Untitled quest",
          title: kind === "private"
            ? `${m.quests?.title || "Untitled listing"} · Private · ${(partnerName || "Member").trim().split(/\s+/)[0]}`
            : `${m.quests?.title || "Untitled listing"} · Public`,
          lastMessageAt: m.created_at,
          preview: getMessageText(m.body),
          mediaVideoUrl: m.quests?.media_video_url || null,
          mediaFallbackUrl: m.quests?.media_items?.find((mi) => mi.type === "image")?.url || null,
          mediaItems,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  }, [messages, userId, questOwners, partnerProfiles]);

  const visibleThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((thread) => [thread.title, thread.partnerName, thread.preview].some((value) => (value || "").toLowerCase().includes(query)));
  }, [threadSearch, threads]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) || null, [threads, activeThreadId]);

  useEffect(() => {
    if (!supabase || !userId || !activeThread) return;
    const key = getTypingChannelKey(activeThread, userId);
    if (!key) return;

    const channel = supabase
      .channel(`inbox-${key}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { senderId?: string; name?: string };
        if (!p?.senderId || p.senderId === userId) return;
        setTypingNames((prev) => Array.from(new Set([...prev, p.name || "Someone"])));
        if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = window.setTimeout(() => setTypingNames([]), 2200);
      })
      .subscribe();
    typingChannelRef.current = channel;

    return () => {
      setTypingNames([]);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, activeThread]);

  const activeMessages = useMemo(() => {
    if (!activeThread) return [];
    return messages
      .filter((m) => {
        if (m.quest_id !== activeThread.questId) return false;
        if (getMessagePrivacy(m.body) !== activeThread.kind) return false;
        if (activeThread.kind !== "private") return true;
        const recipientId = getPrivateRecipientId(m.body);
        const partnerId = m.sender_id === userId ? (recipientId || m.quests?.creator_id || null) : m.sender_id;
        return partnerId === activeThread.partnerId;
      })
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  }, [messages, activeThread, userId]);

  useEffect(() => {
    if (typeof window !== "undefined" && !pendingThreadTargetRef.current) {
      const params = new URLSearchParams(window.location.search);
      pendingThreadTargetRef.current = {
        thread: params.get("thread"),
        message: params.get("message"),
      };
    }
  }, []);

  useEffect(() => {
    if (!pendingThreadTargetRef.current || !threads.length || didAutoSelectRef.current) return;
    const requestedThreadId = pendingThreadTargetRef.current.thread;
    if (requestedThreadId && threads.some((t) => t.id === requestedThreadId)) {
      setActiveThreadId(requestedThreadId);
      setSelectedMessageId(pendingThreadTargetRef.current.message);
      didAutoSelectRef.current = true;
      return;
    }
    pendingThreadTargetRef.current = null;
  }, [threads]);

  useEffect(() => {
    if (!selectedMessageId) return;
    const el = document.getElementById(`message-${selectedMessageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setSelectedMessageId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [selectedMessageId, activeMessages]);

  useEffect(() => {
    lastMessageIdRef.current = null;
    lastIncomingIdRef.current = null;
    queueMicrotask(() => {
      setShowJumpToLatest(false);
      setNewIncomingCount(0);
    });
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    if (!activeThread) queueMicrotask(() => setActiveThreadId(null));
  }, [activeThreadId, activeThread]);

  useEffect(() => {
    const pane = messagesPaneRef.current;
    if (!pane) return;
    const onScroll = () => {
      const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
      if (nearBottom) {
        setShowJumpToLatest(false);
        setNewIncomingCount(0);
      }
    };
    pane.addEventListener("scroll", onScroll);
    return () => pane.removeEventListener("scroll", onScroll);
  }, [activeThreadId]);

  useEffect(() => {
    const pane = messagesPaneRef.current;
    if (!pane || activeMessages.length === 0) return;
    const latest = activeMessages[activeMessages.length - 1] || null;
    const latestId = latest?.id || null;
    const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;

    if (!lastMessageIdRef.current) {
      lastMessageIdRef.current = latestId;
      lastIncomingIdRef.current = activeMessages.filter((m) => m.sender_id !== userId).at(-1)?.id || null;
      requestAnimationFrame(() => {
        pane.scrollTop = pane.scrollHeight;
      });
      return;
    }

    if (latestId && latestId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = latestId;
      const latestIncomingId = activeMessages.filter((m) => m.sender_id !== userId).at(-1)?.id || null;
      const hasNewIncoming = !!latestIncomingId && latestIncomingId !== lastIncomingIdRef.current;
      if (latestIncomingId) lastIncomingIdRef.current = latestIncomingId;

      if (nearBottom) {
        requestAnimationFrame(() => {
          pane.scrollTop = pane.scrollHeight;
          setShowJumpToLatest(false);
          setNewIncomingCount(0);
        });
      } else if (hasNewIncoming) {
        queueMicrotask(() => {
          setShowJumpToLatest(true);
          setNewIncomingCount((n) => n + 1);
        });
      }
    }
  }, [activeMessages, userId]);

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId || !activeThread || !draft.trim()) return;
    if (sending) return;
    if (Date.now() - lastSendMs < 3000) return setStatus("Slow down a sec before sending again.");
    const trimmed = draft.trim();
    if (trimmed.length < 2) return setStatus("Message is too short.");
    if (trimmed.length > 500) return setStatus("Message is too long (max 500 chars).");

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count || 0) >= 6) return setStatus("Rate limit: please wait a minute before sending more messages.");

    setSending(true);
    const prefix = activeThread.kind === "private"
      ? (activeThread.partnerId ? `[PRIVATE to=${activeThread.partnerId}] ` : "[PRIVATE] ")
      : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: activeThread.questId,
      sender_id: userId,
      body: `${prefix}${trimmed}`,
    });
    setSending(false);
    if (error) return setStatus(error.message);

    setDraft("");
    setLastSendMs(Date.now());
    await loadInbox(userId, true);
  }

  if (!supabase) return <main className="min-h-screen bg-transparent p-4">Missing Supabase config.</main>;

  if (!userId && !loading) {
    return (
      <main className="page-shell page-inbox min-h-screen bg-transparent p-4">
        <div className="max-w-3xl mx-auto rounded-2xl border bg-white p-6">
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="mt-2 text-sm text-gray-600">Please log in from the home page first to view messages.</p>
          <Link href="/" className="inline-block mt-4 border rounded px-3 py-2">Go home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell page-inbox app-page min-h-screen bg-transparent p-4">
      <div className="max-w-6xl mx-auto inbox119-shell">
        <div className="mb-3 flex items-center justify-between app-page-header app-inbox-header">
          <div><h1 className="text-2xl font-bold">Inbox</h1><p className="app-page-subtitle">Private conversations about your plans.</p></div>
          <div className="flex gap-2">
            <button className="inbox119-refresh" aria-label="Refresh inbox" onClick={() => userId && void loadInbox(userId)}><AppIcon name="refresh" /></button>
          </div>
        </div>

        <div className="app-search-field mb-3"><AppIcon name="search" /><input value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder="Search people, quests, or messages" aria-label="Search inbox" /></div>

        {status && <div className="mb-3 rounded border bg-amber-50 px-3 py-2 text-sm">{status}</div>}

        {questInvitations.length > 0 ? (
          <section className="inbox119-invitations mb-3 rounded-2xl border p-3">
            <div className="inbox119-invitation-heading"><h2 className="font-semibold">Quest invitations</h2><span>{questInvitations.length} new</span></div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {questInvitations.map((invitation) => {
                const sender = Array.isArray(invitation.sender) ? invitation.sender[0] : invitation.sender;
                const quest = Array.isArray(invitation.quests) ? invitation.quests[0] : invitation.quests;
                const busy = invitationActionId === invitation.id;
                return <article key={invitation.id} className="rounded-xl border bg-white p-3"><div className="flex items-center gap-2">{sender?.avatar_url ? <img src={sender.avatar_url} alt="" className="h-9 w-9 rounded-full border object-cover" /> : <div className="h-9 w-9 rounded-full border bg-slate-100" />}<div className="min-w-0"><p className="font-semibold">{sender?.display_name || "A host"}</p><Link href={`/listing/${quest?.id || ""}`} className="block truncate text-xs text-cyan-800 underline">{quest?.title || "Quest invitation"}</Link></div></div>{invitation.message ? <p className="mt-2 text-sm text-slate-700">{invitation.message}</p> : null}<div className="mt-3 flex gap-2"><button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={() => void respondToInvitation(invitation.id, false)}>Decline</button><button type="button" disabled={busy} className="rounded-lg bg-[#0f7486] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void respondToInvitation(invitation.id, true)}>{busy ? "Joining…" : "Accept & join"}</button></div></article>;
              })}
            </div>
          </section>
        ) : null}

        <button type="button" onClick={() => openPeopleFinder(hostedQuests[0])} className="inbox119-find-people mb-3" aria-label="Find people for your quest">
          <span className="inbox119-find-icon" aria-hidden="true"><AppIcon name="people" /></span>
          <span><strong>Find people for your quest</strong><small>Browse opted-in adults nearby, start a conversation, or send an invitation.</small></span>
          <b aria-hidden="true">→</b>
        </button>

        <div className="grid md:grid-cols-[340px_1fr] gap-3">
          <aside className={`rounded-2xl border bg-white p-2 max-h-[72vh] overflow-auto app-thread-list ${activeThread ? "hidden md:block" : "block"}`}>
            {loading ? (
              <div className="space-y-2 p-1">
                <div className="h-20 rounded-xl border sq-shimmer" />
                <div className="h-20 rounded-xl border sq-shimmer" />
                <div className="h-20 rounded-xl border sq-shimmer" />
              </div>
            ) : visibleThreads.length === 0 ? <p className="p-3 text-sm text-gray-500">{threadSearch ? "No conversations match your search." : "No messages yet."}</p> : visibleThreads.map(thread => (
              <button key={thread.id} className={`inbox119-thread ${activeThreadId === thread.id ? "is-active" : ""}`} type="button" onClick={() => setActiveThreadId(thread.id)}>
                {thread.partnerAvatar ? <img src={thread.partnerAvatar} alt="" /> : <span className="inbox119-avatar">{thread.kind === "private" ? getInitial(thread.partnerName) : <AppIcon name="people" />}</span>}
                <span className="inbox119-thread-copy"><strong>{thread.kind === "private" ? thread.partnerName || "QuestHat member" : "Quest conversation"}</strong><span className="inbox119-quest-title">{thread.questTitle}</span><span className="inbox119-preview">{thread.preview}</span></span>
                <span className="inbox119-thread-tail"><time dateTime={thread.lastMessageAt}>{formatActivityTime(thread.lastMessageAt)}</time><span aria-hidden="true">›</span></span>
              </button>
            ))}
            {!loading && threads.length <= 2 && hostedQuests.length > 0 ? (
              <div className="inbox119-start mt-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Start the conversation</p>
                <p className="mt-1 text-xs text-slate-600">Find opted-in people for a quest you host, then message or invite them.</p>
                <div className="mt-2 grid gap-1.5">
                  {hostedQuests.slice(0, 3).map((quest) => <button type="button" key={quest.id} onClick={() => openPeopleFinder(quest)} className="rounded-lg bg-[#0f7486] px-3 py-2 text-xs font-semibold text-white">Find people for {quest.title || "this quest"}</button>)}
                </div>
              </div>
            ) : null}
          </aside>

          <section className={`rounded-2xl border bg-white p-3 flex flex-col h-[72vh] app-message-thread ${activeThread ? "block" : "hidden md:flex"}`}>
            {activeThread && (
              <div className="mb-2 pb-2 border-b text-sm flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" className="border rounded px-2 py-1 md:hidden" onClick={() => {
                    didAutoSelectRef.current = true;
                    setShowJumpToLatest(false);
                    setNewIncomingCount(0);
                    setActiveThreadId(null);
                  }}>Inbox</button>
                  <span className={`px-2 py-1 rounded ${activeThread.kind === "private" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {activeThread.kind === "private" ? `Private with ${(activeThread.partnerName || "Member").trim().split(/\s+/)[0]}` : "Public conversation"}
                  </span>
                </div>
                <Link href={`/listing/${activeThread.questId}`} className="underline">Open listing</Link>
              </div>
            )}

            <div ref={messagesPaneRef} className="flex-1 overflow-auto space-y-2 pr-1">
              {activeMessages.length === 0 ? (
                <p className="text-sm text-gray-500">Pick a thread to view messages.</p>
              ) : (
                activeMessages.map((m) => {
                  const mine = m.sender_id === userId;
                  return (
                    <div
                      id={`message-${m.id}`}
                      key={m.id}
                      className={`max-w-[86%] rounded-xl px-3 py-2 text-sm ${mine ? "ml-auto bg-black text-white" : "bg-gray-100"} ${selectedMessageId === m.id ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {m.profiles?.avatar_url ? (
                          <img src={m.profiles.avatar_url} alt={m.profiles.display_name || "User"} className="h-5 w-5 rounded-full object-cover border" />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-white border grid place-items-center text-[9px] font-semibold text-gray-700">{getInitial(m.profiles?.display_name || (mine ? "You" : "Member"))}</div>
                        )}
                        <Link href={`/profile/${m.sender_id}`} className={`text-[11px] underline ${mine ? "text-white/80" : "text-gray-600"}`}>
                          {mine ? "You" : (m.profiles?.display_name || "Member").trim().split(/\s+/)[0]}
                        </Link>
                        {m.quests?.creator_id === m.sender_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Organizer</span>
                        )}
                      </div>
                      <p>{getMessageText(m.body)}</p>
                      <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-gray-500"}`}>{formatActivityTime(m.created_at)}</p>
                    </div>
                  );
                })
              )}
            </div>

            {showJumpToLatest && (
              <div className="mt-2 mb-1">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white sq-badge-pulse"
                  onClick={() => {
                    const pane = messagesPaneRef.current;
                    if (!pane) return;
                    pane.scrollTop = pane.scrollHeight;
                    setShowJumpToLatest(false);
                    setNewIncomingCount(0);
                  }}
                >
                  {newIncomingCount > 0 ? `${newIncomingCount} new message${newIncomingCount > 1 ? "s" : ""}` : "New messages"} · Jump to latest
                </button>
              </div>
            )}
            {typingNames.length > 0 && (
              <p className="text-xs text-gray-500 mb-1">{typingNames.join(", ")} typing…</p>
            )}
            <form onSubmit={sendReply} className="mt-3 flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2"
                placeholder={activeThread ? `Reply in ${activeThread.kind} thread...` : "Select a thread to reply"}
                value={draft}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraft(next);
                  if (!userId || !activeThread || !next.trim() || !typingChannelRef.current) return;
                  if (Date.now() - lastTypingSendRef.current < 900) return;
                  lastTypingSendRef.current = Date.now();
                  void typingChannelRef.current.send({
                    type: "broadcast",
                    event: "typing",
                    payload: { senderId: userId, name: userName },
                  });
                }}
                disabled={!activeThread}
              />
              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={!activeThread || !draft.trim() || sending}>{sending ? "Sending..." : "Send"}</button>
            </form>
          </section>
        </div>
      </div>
      {showPeopleFinder && userId && <PeopleFinder key={peopleQuest?.id || "choose"} client={supabase} userId={userId} quest={peopleQuest} quests={hostedQuests} onQuestChange={quest => { const url = new URL(window.location.href); url.searchParams.set("people", quest.id); window.history.replaceState(window.history.state, "", url.pathname + url.search); setPeopleQuestId(quest.id); }} onClose={closePeopleFinder} onMessageSent={(questId, personId) => { closePeopleFinder(); setActiveThreadId(`${questId}:private:${personId}`); void loadInbox(userId, true); }} />}
    </main>
  );
}
