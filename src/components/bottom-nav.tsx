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

  function requireAuthNavigate(path: string) {
    if (userId) return router.push(path);
    router.push("/?auth=1");
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-white/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-2 grid grid-cols-4 items-end">
        <Link href="/" className={`text-center text-xs py-2 ${isActive("/") ? "font-semibold" : "text-gray-600"}`}>
          <div>🏠</div>
          <div>Home</div>
        </Link>

        <button type="button" onClick={() => requireAuthNavigate("/inbox")} className={`text-center text-xs py-2 ${isActive("/inbox") ? "font-semibold" : "text-gray-600"}`}>
          <div>📥</div>
          <div>Inbox</div>
        </button>

        <button type="button" onClick={() => requireAuthNavigate("/?create=1")} className="text-center -mt-6">
          <div className="mx-auto h-12 w-12 rounded-full bg-black text-white grid place-items-center text-2xl leading-none">+</div>
          <div className="text-[11px] mt-1 text-gray-700">Create</div>
        </button>

        <button type="button" onClick={() => requireAuthNavigate("/settings")} className={`text-center text-xs py-2 ${isActive("/settings") ? "font-semibold" : "text-gray-600"}`}>
          <div>⚙️</div>
          <div>Settings</div>
        </button>
      </div>
    </nav>
  );
}
