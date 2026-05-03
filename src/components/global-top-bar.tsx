"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { getPersistedNotificationLastSeen } from "@/lib/notification-state";

export default function GlobalTopBar() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUserId(u?.id ?? null);
      const name = (u?.user_metadata?.full_name as string | undefined) || (u?.user_metadata?.name as string | undefined) || "";
      setUserLabel((name || u?.email || "").toString());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUserId(u?.id ?? null);
      const name = (u?.user_metadata?.full_name as string | undefined) || (u?.user_metadata?.name as string | undefined) || "";
      setUserLabel((name || u?.email || "").toString());
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const run = async () => {
      const lastSeenRaw = await getPersistedNotificationLastSeen(supabase, userId);
      const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;

      const [{ data: myMessages }, { data: joinedRows }] = await Promise.all([
        supabase.from("messages").select("id,created_at,sender_id").neq("sender_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("quest_members").select("quest_id,status,joined_at").eq("user_id", userId).in("status", ["pending", "approved"]).order("joined_at", { ascending: false }).limit(50),
      ]);

      const messageCount = ((myMessages || []) as Array<{ created_at: string }>).filter((row) => !lastSeen || new Date(row.created_at).getTime() > lastSeen).length;
      const joinCount = ((joinedRows || []) as Array<{ joined_at?: string | null; status?: string | null }>).filter((row) => row.status === "pending" || row.status === "approved").filter((row) => !lastSeen || new Date(row.joined_at || new Date().toISOString()).getTime() > lastSeen).length;
      setNotificationCount(messageCount + joinCount);
    };
    void run();
    const id = window.setInterval(run, 30000);
    return () => window.clearInterval(id);
  }, [supabase, userId]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.href = "/";
  }

  function openLogin() {
    if (typeof window === "undefined") return;
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("sidequest:open-auth"));
      return;
    }
    sessionStorage.setItem("sidequest_open_auth", "1");
    router.push("/");
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b nav-shell">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[52px] flex items-center justify-between gap-3">
        <Link href="/" className="nav-brand text-[15px] tracking-tight">Sydequest</Link>
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/" className={`nav-item text-xs px-3 py-1 ${pathname === "/" ? "nav-item-active" : ""}`}>Home</Link>
          <button type="button" onClick={() => router.push("/notifications")} className={`nav-item text-xs px-3 py-1 ${pathname === "/notifications" ? "nav-item-active" : ""}`}>
            Notifications
            {notificationCount > 0 ? <span className="ml-2 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-black text-white text-[10px]">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </button>
          <button type="button" onClick={() => router.push("/inbox")} className={`nav-item text-xs px-3 py-1 ${pathname === "/inbox" ? "nav-item-active" : ""}`}>Inbox</button>
          <button type="button" onClick={() => router.push("/joined")} className={`nav-item text-xs px-3 py-1 ${pathname === "/joined" ? "nav-item-active" : ""}`}>Joined</button>
          <button type="button" onClick={() => router.push("/settings")} className={`nav-item text-xs px-3 py-1 ${pathname === "/settings" ? "nav-item-active" : ""}`}>Settings</button>
          <button
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              if (pathname === "/") {
                window.dispatchEvent(new CustomEvent("sidequest:open-create"));
                return;
              }
              sessionStorage.setItem("sidequest_open_create", "1");
              router.push("/");
            }}
            className="nav-item text-xs px-3 py-1 border border-slate-300 bg-slate-50"
          >
            Create
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {userId && userLabel ? <span className="text-xs text-gray-500 hidden md:inline">Signed in as {userLabel.split("@")[0]}</span> : null}
          {userId ? (
            <button className="nav-control" onClick={() => void signOut()}>Sign out</button>
          ) : (
            <button className="nav-control" onClick={openLogin}>Log in</button>
          )}
        </div>
      </div>
    </header>
  );
}
