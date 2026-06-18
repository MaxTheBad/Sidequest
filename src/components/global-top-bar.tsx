"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPrivilegedRole } from "@/lib/admin.js";
import { APP_NAME, dispatchAppEvent } from "@/lib/app-brand";
import { getSupabaseClient } from "@/lib/supabase";
import { getPersistedNotificationLastSeen } from "@/lib/notification-state";
import { getUnreadDeliveredNotificationCount } from "@/lib/notifications";

export default function GlobalTopBar() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      setUserId(u?.id ?? null);
      const name = (u?.user_metadata?.full_name as string | undefined) || (u?.user_metadata?.name as string | undefined) || "";
      setUserLabel((name || u?.email || "").toString());
    };
    void syncSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUserId(u?.id ?? null);
      const name = (u?.user_metadata?.full_name as string | undefined) || (u?.user_metadata?.name as string | undefined) || "";
      setUserLabel((name || u?.email || "").toString());
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !userId) {
      setUserRole("user");
      return;
    }
    const loadRole = async () => {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error) {
        setUserRole("user");
        return;
      }
      setUserRole((data as { role?: string | null } | null)?.role || "user");
    };
    void loadRole();
  }, [supabase, userId]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const run = async () => {
      const deliveredCount = await getUnreadDeliveredNotificationCount(supabase, userId);
      if (deliveredCount !== null) {
        setNotificationCount(deliveredCount);
        return;
      }
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
      dispatchAppEvent("open-auth");
      return;
    }
    sessionStorage.setItem("gathergo_open_auth", "1");
    router.push("/");
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b nav-shell">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[52px] flex items-center justify-between gap-3">
        <Link href="/" className="nav-brand text-[15px] tracking-tight">{APP_NAME}</Link>
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/" className={`nav-item text-xs px-3 py-1 ${pathname === "/" ? "nav-item-active" : ""}`}>Home</Link>
          <Link href="/saved" className={`nav-item text-xs px-3 py-1 ${pathname === "/saved" ? "nav-item-active" : ""}`}>Saved</Link>
          <button type="button" onClick={() => router.push("/notifications")} className={`nav-item text-xs px-3 py-1 ${pathname === "/notifications" ? "nav-item-active" : ""}`}>
            Notifications
            {notificationCount > 0 ? <span className="ml-2 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-black text-white text-[10px]">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </button>
          <button type="button" onClick={() => router.push("/inbox")} className={`nav-item text-xs px-3 py-1 ${pathname === "/inbox" ? "nav-item-active" : ""}`}>Inbox</button>
          <button type="button" onClick={() => router.push("/joined")} className={`nav-item text-xs px-3 py-1 ${pathname === "/joined" ? "nav-item-active" : ""}`}>Joined</button>
          <button type="button" onClick={() => router.push("/settings")} className={`nav-item text-xs px-3 py-1 ${pathname === "/settings" ? "nav-item-active" : ""}`}>Settings</button>
          {isPrivilegedRole(userRole) ? (
            <button type="button" onClick={() => router.push("/moderation")} className={`nav-item text-xs px-3 py-1 ${pathname === "/moderation" ? "nav-item-active" : ""}`}>
              Moderation
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              if (pathname === "/") {
                dispatchAppEvent("open-create");
                return;
              }
              sessionStorage.setItem("gathergo_open_create", "1");
              router.push("/");
            }}
            className="nav-item text-xs px-3 py-1 border border-slate-300 bg-slate-50"
            style={{ color: "#000" }}
          >
            Create
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {userId && userLabel ? <span className="text-xs text-gray-500 hidden md:inline">Signed in as {userLabel.split("@")[0]}</span> : null}
          {userId && pathname === "/" ? (
            <Link href="/saved" className="nav-control">
              Saved
            </Link>
          ) : null}
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
