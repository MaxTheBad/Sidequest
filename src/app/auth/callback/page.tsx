"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

const PENDING_APPLE_DELETION_KEY = "questhat.pendingAppleAccountDeletion";
const PENDING_APPLE_DELETION_TTL_MS = 10 * 60 * 1000;

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const started = useRef(false);
  const [status, setStatus] = useState("Signing you in...");
  const message = supabase ? status : "Missing Supabase config.";

  useEffect(() => {
    if (!supabase || started.current) return;
    started.current = true;

    const captureAppleTokenAndMaybeDelete = async (session: {
      access_token: string;
      provider_refresh_token?: string | null;
      user: {
        id: string;
        app_metadata?: { provider?: string; providers?: string[] };
        identities?: Array<{ provider?: string }>;
      };
    }) => {
      const isApple = session.user.app_metadata?.provider === "apple"
        && (session.user.identities?.some((identity) => identity.provider === "apple")
          || session.user.app_metadata?.providers?.includes("apple"));
      const providerRefreshToken = session.provider_refresh_token?.trim() || "";
      let pending: { userId: string; createdAt: number } | null = null;
      try {
        const rawPending = window.sessionStorage.getItem(PENDING_APPLE_DELETION_KEY);
        const parsed = rawPending ? JSON.parse(rawPending) : null;
        pending = parsed
          && typeof parsed.userId === "string"
          && typeof parsed.createdAt === "number"
          ? parsed
          : null;
      } catch {
        pending = null;
      }
      if (pending && (Date.now() - pending.createdAt > PENDING_APPLE_DELETION_TTL_MS || pending.createdAt > Date.now() + 60_000)) {
        window.sessionStorage.removeItem(PENDING_APPLE_DELETION_KEY);
        pending = null;
      }
      if (!isApple || !providerRefreshToken) {
        if (pending) {
          window.sessionStorage.removeItem(PENDING_APPLE_DELETION_KEY);
          await supabase.auth.signOut().catch(() => undefined);
          setStatus("Sign in with Apple did not return a refresh token. Your account was not deleted; return to Settings and retry.");
          return true;
        }
        return false;
      }
      if (pending && pending.userId !== session.user.id) {
        window.sessionStorage.removeItem(PENDING_APPLE_DELETION_KEY);
        await supabase.auth.signOut().catch(() => undefined);
        setStatus("Sign in with Apple returned a different QuestHat account. No account was deleted.");
        return true;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const captureResponse = await fetch(`${supabaseUrl}/functions/v1/apple-token-capture`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerRefreshToken }),
      });
      const captureResult = await captureResponse.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!captureResponse.ok || !captureResult.ok) {
        if (pending) window.sessionStorage.removeItem(PENDING_APPLE_DELETION_KEY);
        setStatus(captureResult.error || "Sign in with Apple cleanup could not be prepared. No account was deleted.");
        return Boolean(pending);
      }
      if (!pending) return false;

      const deletionResponse = await fetch(`${supabaseUrl}/functions/v1/account-deletion`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation: "DELETE",
          supportsAppleReauthentication: true,
        }),
      });
      const deletionResult = await deletionResponse.json().catch(() => ({})) as { ok?: boolean; error?: string };
      window.sessionStorage.removeItem(PENDING_APPLE_DELETION_KEY);
      if (!deletionResponse.ok || !deletionResult.ok) {
        setStatus(deletionResult.error || "Account deletion could not finish. Return to Settings and retry.");
        return true;
      }
      await supabase.auth.signOut().catch(() => undefined);
      router.replace("/?account_deleted=1");
      return true;
    };

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const callbackError = params.get("error_description") || params.get("error");

      if (callbackError) {
        setStatus(`Auth callback failed: ${callbackError}`);
        return;
      }

      const code = params.get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus(`Auth callback failed: ${error.message}`);
          return;
        }
        if (data.session?.user) {
          if (await captureAppleTokenAndMaybeDelete(data.session)) return;
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
          const pending = window.sessionStorage.getItem(PENDING_APPLE_DELETION_KEY);
          if (pending) {
            window.sessionStorage.removeItem(PENDING_APPLE_DELETION_KEY);
            setStatus("Sign in with Apple did not return a refresh token. Your account was not deleted; return to Settings and retry.");
            return;
          }
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
