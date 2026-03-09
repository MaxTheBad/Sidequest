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
  const [userLabel, setUserLabel] = useState("");

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
    <header className="fixed top-0 inset-x-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
        <Link href="/" className="font-semibold text-sm">Side Quest</Link>
        <div className="ml-auto flex items-center gap-2">
          {userId && userLabel ? <span className="text-xs text-gray-600 hidden sm:inline">Signed in as {userLabel.split("@")[0]}</span> : null}
          {userId ? (
            <button className="border rounded px-3 py-1.5 text-sm" onClick={() => void signOut()}>Sign out</button>
          ) : (
            <button className="border rounded px-3 py-1.5 text-sm" onClick={openLogin}>Log in</button>
          )}
        </div>
      </div>
    </header>
  );
}
