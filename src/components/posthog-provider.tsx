"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const analyticsConsentKey = "questhat_optional_analytics";
const analyticsConsentEvent = "questhat:analytics-consent";
let optionalAnalyticsEnabled = false;
let pendingProductUserId: string | null = null;
type AnalyticsConsent = "loading" | "unset" | "granted" | "denied";

function getAnalyticsConsent(): AnalyticsConsent {
  if (!posthogKey || typeof window === "undefined") return "denied";
  try {
    const saved = window.localStorage.getItem(analyticsConsentKey);
    return saved === "granted" || saved === "denied" ? saved : "unset";
  } catch {
    return "denied";
  }
}

function subscribeToAnalyticsConsent(notify: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(analyticsConsentEvent, notify);
  return () => window.removeEventListener(analyticsConsentEvent, notify);
}

function startOptionalAnalytics() {
  optionalAnalyticsEnabled = true;
  posthog.opt_in_capturing();
  if (pendingProductUserId) posthog.identify(pendingProductUserId, { platform: "web" });
}

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
  if (posthogKey && optionalAnalyticsEnabled) posthog.capture(name, properties);
}

export function identifyProductUser(userId: string) {
  pendingProductUserId = userId;
  if (posthogKey && optionalAnalyticsEnabled) posthog.identify(userId, { platform: "web" });
}

export function resetProductUser() {
  if (!posthogKey) return;
  pendingProductUserId = null;
  const wasOptedIn = !posthog.has_opted_out_capturing();
  posthog.reset();
  if (wasOptedIn) posthog.opt_in_capturing();
}

export default function QuestHatPostHogProvider({ children }: { children: React.ReactNode }) {
  const consent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    getAnalyticsConsent,
    () => "loading" as const,
  );

  useEffect(() => {
    if (consent === "granted") {
      startOptionalAnalytics();
    } else if (consent === "denied") {
      optionalAnalyticsEnabled = false;
      posthog.opt_out_capturing();
    }
  }, [consent]);

  const chooseAnalytics = (choice: "granted" | "denied") => {
    try { updateOptionalAnalytics(choice); } catch { /* Keep the prompt if the preference cannot be saved. */ }
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

function updateOptionalAnalytics(choice: "granted" | "denied") {
  if (!posthogKey || typeof window === "undefined") return;
  // A denied choice stops capture immediately, even when persistence is unavailable.
  if (choice === "denied") {
    optionalAnalyticsEnabled = false;
    posthog.opt_out_capturing();
    posthog.reset();
  }
  window.localStorage.setItem(analyticsConsentKey, choice);
  if (choice === "granted") {
    startOptionalAnalytics();
  }
  window.dispatchEvent(new Event(analyticsConsentEvent));
}

export function OptionalAnalyticsPreference() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    void Promise.resolve().then(() => {
      try { setEnabled(window.localStorage.getItem(analyticsConsentKey) === "granted"); } catch { setStatus("This browser cannot save the analytics preference."); }
    });
  }, []);
  return <section className="settings-parity-interests"><h2>Optional analytics</h2><p>Allow privacy-limited analytics to help improve QuestHat. No ads, session recordings, or cross-app tracking.</p><label className="flex items-center gap-3"><input type="checkbox" checked={enabled} disabled={!posthogKey} onChange={event => { const next = event.target.checked; try { updateOptionalAnalytics(next ? "granted" : "denied"); setEnabled(next); setStatus(next ? "Optional analytics enabled." : "Optional analytics off."); } catch { if (!next) setEnabled(false); setStatus("Could not save this preference in your browser."); } }} />Allow optional analytics</label>{!posthogKey ? <p>Optional analytics is unavailable in this environment.</p> : null}{status ? <p role="status">{status}</p> : null}</section>;
}
