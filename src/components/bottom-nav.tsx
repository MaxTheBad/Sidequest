"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

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
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t nav-shell">
      <div className="max-w-5xl mx-auto px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] grid grid-cols-5 items-end">
        <Link href="/" className={`text-center text-xs py-2 transition ${isActive("/") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[15px]">🏠</div>
          <div className="text-[11px] mt-0.5">Home</div>
        </Link>

        <button type="button" onClick={() => requireAuthNavigate("/inbox")} className={`text-center text-xs py-2 transition ${isActive("/inbox") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[15px]">📥</div>
          <div className="text-[11px] mt-0.5">Inbox</div>
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
          <div className="mx-auto h-12 w-12 rounded-full nav-create create-halo grid place-items-center text-2xl leading-none">+</div>
          <div className="text-[11px] mt-1 font-semibold text-[color:var(--foreground)] bg-transparent">Create</div>
        </button>

        <button type="button" onClick={() => requireAuthNavigate("/joined")} className={`text-center text-xs py-2 transition ${isActive("/joined") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[15px]">✅</div>
          <div className="text-[11px] mt-0.5">Joined</div>
        </button>

        <button type="button" onClick={() => requireAuthNavigate("/settings")} className={`text-center text-xs py-2 transition ${isActive("/settings") ? "nav-item-active" : "nav-item"}`}>
          <div className="text-[15px]">⚙️</div>
          <div className="text-[11px] mt-0.5">Settings</div>
        </button>
      </div>
    </nav>
  );
}
