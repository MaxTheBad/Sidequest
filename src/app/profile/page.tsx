"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export default function MyProfilePage() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  useEffect(() => {
    if (!supabase) return;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return router.replace("/?auth=1");
      router.replace(`/profile/${uid}`);
    };
    void run();
  }, [supabase, router]);

  return <main className="min-h-screen p-4">Loading profile...</main>;
}
