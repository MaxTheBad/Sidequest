"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [status, setStatus] = useState("Signing you in...");
  const message = supabase ? status : "Missing Supabase config.";

  useEffect(() => {
    if (!supabase) return;

    const finish = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setStatus(`Auth callback failed: ${error.message}`);
        return;
      }

      if (data.session?.user) {
        router.replace("/");
        return;
      }

      setStatus("No session found. You can close this page and try again.");
    };

    void finish();
  }, [router, supabase]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-700">{message}</p>
      </div>
    </main>
  );
}
