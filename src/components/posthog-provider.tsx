"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const analyticsConsentKey = "questhat_optional_analytics";

if (typeof window !== "undefined" && posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
    respect_dnt: true,
    opt_out_capturing_by_default: true,
  });
}

function privacySafePath(pathname: string) {
  if (pathname.startsWith("/listing/")) return "/listing/[id]";
  return pathname;
}

function PageViewCapture({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || !posthogKey || typeof window === "undefined") return;
    const path = privacySafePath(pathname || "/");
    posthog.capture("$pageview", {
      $current_url: `${window.location.origin}${path}`,
      page_path: path,
    });
  }, [enabled, pathname]);

  return null;
}

export function captureProductEvent(name: string, properties?: Record<string, string | number | boolean | null>) {
  if (posthogKey) posthog.capture(name, properties);
}

export function identifyProductUser(userId: string) {
  if (posthogKey) posthog.identify(userId, { platform: "web" });
}

export function resetProductUser() {
  if (!posthogKey) return;
  const wasOptedIn = !posthog.has_opted_out_capturing();
  posthog.reset();
  if (wasOptedIn) posthog.opt_in_capturing();
}

export default function QuestHatPostHogProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<"loading" | "unset" | "granted" | "denied">("loading");

  useEffect(() => {
    if (!posthogKey || typeof window === "undefined") {
      setConsent("denied");
      return;
    }
    const saved = window.localStorage.getItem(analyticsConsentKey);
    if (saved === "granted") {
      posthog.opt_in_capturing();
      setConsent("granted");
    } else if (saved === "denied") {
      posthog.opt_out_capturing();
      setConsent("denied");
    } else {
      setConsent("unset");
    }
  }, []);

  const chooseAnalytics = (choice: "granted" | "denied") => {
    if (!posthogKey || typeof window === "undefined") return;
    window.localStorage.setItem(analyticsConsentKey, choice);
    if (choice === "granted") posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
    setConsent(choice);
  };

  if (!posthogKey) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      <PageViewCapture enabled={consent === "granted"} />
      {children}
      {consent === "unset" ? (
        <section className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl" aria-label="Optional analytics preference">
          <p className="text-sm font-semibold text-slate-900">Help improve QuestHat?</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Allow privacy-limited analytics to help us understand which features work. No ads, session recordings, or cross-app tracking.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => chooseAnalytics("denied")} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">No thanks</button>
            <button type="button" onClick={() => chooseAnalytics("granted")} className="rounded-xl bg-cyan-800 px-3 py-2 text-xs font-semibold text-white">Allow analytics</button>
          </div>
        </section>
      ) : null}
    </PostHogProvider>
  );
}
