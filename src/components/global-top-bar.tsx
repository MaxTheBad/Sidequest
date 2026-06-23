"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPrivilegedRole } from "@/lib/admin.js";
import { APP_NAME, dispatchAppEvent } from "@/lib/app-brand";
import { getSupabaseClient } from "@/lib/supabase";
import { getPersistedNotificationLastSeen } from "@/lib/notification-state";
import { getUnreadDeliveredNotificationCount } from "@/lib/notifications";
import { AppIcon, type AppIconName } from "@/components/app-icons";

export default function GlobalTopBar() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 8);
    };
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

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
    let cancelled = false;
    const loadRole = async () => {
      if (!supabase || !userId) {
        if (!cancelled) setUserRole("user");
        return;
      }
      const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (cancelled) return;
      if (error) {
        setUserRole("user");
        return;
      }
      setUserRole((data as { role?: string | null } | null)?.role || "user");
    };
    void loadRole();
    return () => {
      cancelled = true;
    };
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

  function openLogin() {
    if (typeof window === "undefined") return;
    if (pathname === "/") {
      dispatchAppEvent("open-auth");
      return;
    }
    sessionStorage.setItem("gathergo_open_auth", "1");
    router.push("/");
  }

  const navigate = (path: string) => router.push(path);
  const createQuest = () => {
    if (typeof window === "undefined") return;
    if (pathname === "/") return dispatchAppEvent("open-create");
    sessionStorage.setItem("gathergo_open_create", "1");
    router.push("/");
  };
  const items: Array<{ label: string; path: string; icon: AppIconName; action?: () => void }> = [
    { label: "Home", path: "/", icon: "home" },
    { label: "Saved", path: "/saved", icon: "bookmark" },
    { label: "Notifications", path: "/notifications", icon: "bell" },
    { label: "Inbox", path: "/inbox", icon: "message" },
    { label: "Joined", path: "/joined", icon: "people" },
    { label: "Create", path: "", icon: "plus", action: createQuest },
    { label: "Settings", path: "/settings", icon: "settings" },
  ];

  return (
    <>
      <header className={`mobile-topbar fixed top-0 inset-x-0 z-50 border-b nav-shell md:hidden ${isScrolled ? "is-scrolled" : "is-top"}`}>
      <div className="h-[60px] px-4 flex items-center justify-between gap-3">
        <Link href="/" className="nav-brand flex items-center gap-2 text-[15px] tracking-tight">
          <Image src="/questhat-logo.png" alt={APP_NAME} width={34} height={18} className="h-5 w-auto" priority />
          <span>{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
          <button className="icon-control relative" aria-label="Notifications" onClick={() => navigate("/notifications")}><AppIcon name="bell" className="h-5 w-5" />{notificationCount > 0 && <span className="nav-badge">{notificationCount > 9 ? "9+" : notificationCount}</span>}</button>
          {!userId ? <button className="nav-control" onClick={openLogin}>Log in</button> : null}
        </div>
      </div>
      </header>

      <aside className="desktop-rail fixed inset-y-0 left-0 z-50 hidden border-r md:flex md:w-[84px] xl:w-[248px] flex-col p-3 xl:p-4">
        <Link href="/" className="rail-brand flex h-12 items-center gap-3 px-2 xl:px-3">
          <Image src="/questhat-logo.png" alt={APP_NAME} width={38} height={22} className="h-6 w-auto" priority />
          <span className="hidden text-lg font-black tracking-tight xl:block">{APP_NAME}</span>
        </Link>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = item.path ? pathname === item.path : false;
            const content = <><span className="relative"><AppIcon name={item.icon} className="h-[22px] w-[22px]" />{item.label === "Notifications" && notificationCount > 0 ? <span className="nav-badge">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}</span><span className="hidden xl:block">{item.label}</span></>;
            return item.action ? <button key={item.label} type="button" onClick={item.action} className="rail-item rail-create">{content}</button> : <Link key={item.label} href={item.path} className={`rail-item ${active ? "active" : ""}`}>{content}</Link>;
          })}
          {isPrivilegedRole(userRole) ? <Link href="/moderation" className={`rail-item ${pathname === "/moderation" ? "active" : ""}`}><AppIcon name="shield" className="h-[22px] w-[22px]" /><span className="hidden xl:block">Moderation</span></Link> : null}
        </nav>
        <div className="rail-account">
          <div className="hidden min-w-0 xl:block"><p className="truncate text-sm font-bold">{userLabel ? userLabel.split("@")[0] : "Guest"}</p><p className="text-xs text-gray-500">{userId ? "Your account" : "Welcome"}</p></div>
          {!userId ? <button className="rail-sign" onClick={openLogin}>Log in</button> : null}
        </div>
      </aside>
    </>
  );
}
