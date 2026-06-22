"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const started = useRef(false);
  const [status, setStatus] = useState("Signing you in...");
  const message = supabase ? status : "Missing Supabase config.";

  useEffect(() => {
    if (!supabase || started.current) return;
    started.current = true;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const callbackError = params.get("error_description") || params.get("error");

      if (callbackError) {
        setStatus(`Auth callback failed: ${callbackError}`);
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus(`Auth callback failed: ${error.message}`);
          return;
        }

        if (data.session?.user) {
          router.replace("/");
          return;
        }
      }

      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setStatus(`Auth callback failed: ${error.message}`);
          return;
        }

        if (data.session?.user) {
          router.replace("/");
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setStatus(`Auth callback failed: ${error.message}`);
        return;
      }

      if (data.session?.user) {
        router.replace("/");
        return;
      }

      setStatus("No authentication response was received. Return home and start again from Log in.");
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
