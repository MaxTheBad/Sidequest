"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPrivilegedRole } from "@/lib/admin.js";
import { dispatchAppEvent } from "@/lib/app-brand";
import { getSupabaseClient } from "@/lib/supabase";
import { getPersistedNotificationLastSeen } from "@/lib/notification-state";
import { getUnreadDeliveredNotificationCount } from "@/lib/notifications";
import { AppIcon } from "@/components/app-icons";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("user");
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !userId) {
      queueMicrotask(() => setUserRole("user"));
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

    const run = async () => {
      const deliveredCount = await getUnreadDeliveredNotificationCount(supabase, userId);
      if (deliveredCount !== null) {
        setNotificationCount(deliveredCount);
        return;
      }
      const lastSeenRaw = await getPersistedNotificationLastSeen(supabase, userId);
      const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;
      const [{ data: myMessages }, { data: joinedRows }] = await Promise.all([
        supabase.from("messages").select("created_at,sender_id").neq("sender_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("quest_members").select("joined_at,status").eq("user_id", userId).in("status", ["pending", "approved"]).order("joined_at", { ascending: false }).limit(50),
      ]);
      const messageCount = ((myMessages || []) as Array<{ created_at: string }>).filter((row) => !lastSeen || new Date(row.created_at).getTime() > lastSeen).length;
      const joinCount = ((joinedRows || []) as Array<{ joined_at?: string | null; status?: string | null }>).filter((row) => !lastSeen || new Date(row.joined_at || new Date().toISOString()).getTime() > lastSeen).length;
      setNotificationCount(messageCount + joinCount);
    };
    void run();
    const id = window.setInterval(run, 30000);
    return () => window.clearInterval(id);
  }, [supabase, userId]);

  const isActive = (path: string) => pathname === path;

  async function requireAuthNavigate(path: string) {
    let authedUserId = userId;
    if (!authedUserId && supabase) {
      const { data } = await supabase.auth.getSession();
      authedUserId = data.session?.user?.id ?? null;
      if (authedUserId) setUserId(authedUserId);
    }

    if (authedUserId) return router.push(path);
    if (typeof window === "undefined") return;
    if (pathname === "/") {
      dispatchAppEvent("open-auth");
      return;
    }
    sessionStorage.setItem("gathergo_open_auth", "1");
    router.push("/");
  }

  return (
    <nav className="mobile-dock fixed inset-x-0 bottom-0 z-[90] md:hidden">
      <div className={`mobile-dock-inner mx-auto grid items-center ${isPrivilegedRole(userRole) ? "grid-cols-6" : "grid-cols-5"}`}>
        <Link href="/" aria-label="Home" className={`dock-item text-center transition ${isActive("/") ? "nav-item-active" : "nav-item"}`}>
          <AppIcon name="home" className="mx-auto h-[22px] w-[22px]" />
          <div className="dock-label">Home</div>
        </Link>

        <button aria-label="Inbox" type="button" onClick={() => requireAuthNavigate("/inbox")} className={`dock-item text-center transition ${isActive("/inbox") ? "nav-item-active" : "nav-item"}`}>
          <AppIcon name="message" className="mx-auto h-[22px] w-[22px]" />
          <div className="dock-label">
            <span>Inbox</span>
            {notificationCount > 0 ? <span className="inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-black text-white text-[9px] leading-none">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (typeof window === "undefined") return;
            if (pathname === "/") {
              dispatchAppEvent("open-create");
              return;
            }
            sessionStorage.setItem("gathergo_open_create", "1");
            void requireAuthNavigate("/");
          }}
          className="dock-item dock-create text-center bg-transparent border-0 shadow-none appearance-none"
          aria-label="Create"
        >
          <div className="mx-auto h-12 w-12 rounded-full nav-create create-halo grid place-items-center"><AppIcon name="plus" className="h-6 w-6" /></div>
          <div className="dock-label">Create</div>
        </button>

        <button aria-label="Joined" type="button" onClick={() => requireAuthNavigate("/joined")} className={`dock-item text-center transition ${isActive("/joined") ? "nav-item-active" : "nav-item"}`}>
          <AppIcon name="people" className="mx-auto h-[22px] w-[22px]" />
          <div className="dock-label">Joined</div>
        </button>

        <button aria-label="Settings" type="button" onClick={() => requireAuthNavigate("/settings")} className={`dock-item text-center transition ${isActive("/settings") ? "nav-item-active" : "nav-item"}`}>
          <AppIcon name="settings" className="mx-auto h-[22px] w-[22px]" />
          <div className="dock-label">Settings</div>
        </button>

        {isPrivilegedRole(userRole) ? (
          <button aria-label="Moderation" type="button" onClick={() => requireAuthNavigate("/moderation")} className={`dock-item text-center transition ${isActive("/moderation") ? "nav-item-active" : "nav-item"}`}>
            <AppIcon name="shield" className="mx-auto h-[22px] w-[22px]" />
            <div className="dock-label">Mod</div>
          </button>
        ) : null}
      </div>
    </nav>
  );
}
