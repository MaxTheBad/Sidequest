"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function GlobalTopBar() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [themePref, setThemePref] = useState<"auto" | "light" | "dark">("auto");

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
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("sidequest_theme_pref");
    if (saved === "light" || saved === "dark" || saved === "auto") setThemePref(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = themePref === "auto" ? (mq.matches ? "dark" : "light") : themePref;
      document.documentElement.dataset.theme = resolved;
      window.localStorage.setItem("sidequest_theme_pref", themePref);
    };

    apply();
    const listener = () => {
      if (themePref === "auto") apply();
    };
    mq.addEventListener?.("change", listener);
    return () => mq.removeEventListener?.("change", listener);
  }, [themePref]);

  const themeLabel = useMemo(() => (themePref === "auto" ? "Auto" : themePref === "light" ? "Light" : "Dark"), [themePref]);

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
      <div className="max-w-5xl mx-auto px-4 h-[52px] flex items-center justify-between gap-3">
        <Link href="/" className="nav-brand text-[15px] tracking-tight">Sydequest</Link>
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/" className={`nav-item text-xs px-3 py-1 ${pathname === "/" ? "nav-item-active" : ""}`}>Home</Link>
          <button type="button" onClick={() => router.push("/inbox")} className={`nav-item text-xs px-3 py-1 ${pathname === "/inbox" ? "nav-item-active" : ""}`}>Inbox</button>
          <button type="button" onClick={() => router.push("/joined")} className={`nav-item text-xs px-3 py-1 ${pathname === "/joined" ? "nav-item-active" : ""}`}>Joined</button>
          <button type="button" onClick={() => router.push("/settings")} className={`nav-item text-xs px-3 py-1 ${pathname === "/settings" ? "nav-item-active" : ""}`}>Settings</button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="nav-control"
            onClick={() => setThemePref((p) => (p === "auto" ? "light" : p === "light" ? "dark" : "auto"))}
            title="Temporary theme toggle"
          >
            Theme: {themeLabel}
          </button>
          {userId && userLabel ? <span className="text-xs text-white/70 hidden md:inline">Signed in as {userLabel.split("@")[0]}</span> : null}
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
