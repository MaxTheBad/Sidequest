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

  return (
    <main className="page-shell page-profile min-h-screen p-4" aria-busy="true" aria-label="Loading profile">
      <section className="mx-auto max-w-4xl">
        <div className="rounded-3xl border bg-white p-6 sm:p-10">
          <div className="flex items-center gap-5">
            <div className="skeleton h-20 w-20 shrink-0 rounded-full" />
            <div className="w-full max-w-sm space-y-3">
              <div className="skeleton h-6 w-2/3" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
