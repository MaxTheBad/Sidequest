"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPrivilegedRole } from "@/lib/admin.js";
import { getSupabaseClient } from "@/lib/supabase";
import { getPersistedNotificationLastSeen } from "@/lib/notification-state";
import { getUnreadDeliveredNotificationCount } from "@/lib/notifications";

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
      window.dispatchEvent(new CustomEvent("sidequest:open-auth"));
      return;
    }
    sessionStorage.setItem("sidequest_open_auth", "1");
    router.push("/");
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-[90] border-t nav-shell md:hidden">
      <div className={`max-w-5xl mx-auto px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] grid items-end ${isPrivilegedRole(userRole) ? "grid-cols-6" : "grid-cols-5"}`}>
        <Link href="/" className={`text-center text-xs py-2 transition ${isActive("/") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[20px] leading-none">⌂</div>
          <div className="text-[11px] mt-0.5">Home</div>
        </Link>

        <button type="button" onClick={() => requireAuthNavigate("/inbox")} className={`text-center text-xs py-2 transition ${isActive("/inbox") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[20px] leading-none">✉</div>
          <div className="text-[11px] mt-0.5 inline-flex items-center justify-center gap-1">
            <span>Inbox</span>
            {notificationCount > 0 ? <span className="inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-black text-white text-[9px] leading-none">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (typeof window === "undefined") return;
            if (pathname === "/") {
              window.dispatchEvent(new CustomEvent("sidequest:open-create"));
              return;
            }
            sessionStorage.setItem("sidequest_open_create", "1");
            void requireAuthNavigate("/");
          }}
          className="text-center -mt-6 bg-transparent border-0 shadow-none appearance-none p-0"
        >
          <div className="mx-auto h-12 w-12 rounded-full nav-create create-halo grid place-items-center text-[24px] leading-none">+</div>
          <div className="text-[11px] mt-1 font-semibold text-[color:var(--foreground)] bg-transparent">Create</div>
        </button>

        <button type="button" onClick={() => requireAuthNavigate("/joined")} className={`text-center text-xs py-2 transition ${isActive("/joined") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[20px] leading-none">✓</div>
          <div className="text-[11px] mt-0.5">Joined</div>
        </button>

        <button type="button" onClick={() => requireAuthNavigate("/settings")} className={`text-center text-xs py-2 transition ${isActive("/settings") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[20px] leading-none">⚙</div>
          <div className="text-[11px] mt-0.5">Settings</div>
        </button>

        {isPrivilegedRole(userRole) ? (
          <button type="button" onClick={() => requireAuthNavigate("/moderation")} className={`text-center text-xs py-2 transition ${isActive("/moderation") ? "nav-item-active" : "nav-item"}`}>
            <div className="text-[20px] leading-none">🛡</div>
            <div className="text-[11px] mt-0.5">Mod</div>
          </button>
        ) : null}
      </div>
    </nav>
  );
}
