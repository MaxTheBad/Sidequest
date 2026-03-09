"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function GlobalTopBar() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

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
    router.push("/?auth=1");
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="font-semibold text-sm">Side Quest</Link>
        {userId ? (
          <button className="border rounded px-3 py-1.5 text-sm" onClick={() => void signOut()}>Sign out</button>
        ) : (
          <button className="border rounded px-3 py-1.5 text-sm" onClick={openLogin}>Log in</button>
        )}
      </div>
    </header>
  );
}
