"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (typeof window !== "undefined" && posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
    respect_dnt: true,
  });
}

function privacySafePath(pathname: string) {
  if (pathname.startsWith("/listing/")) return "/listing/[id]";
  return pathname;
}

function PageViewCapture() {
  const pathname = usePathname();

  useEffect(() => {
    if (!posthogKey || typeof window === "undefined") return;
    const path = privacySafePath(pathname || "/");
    posthog.capture("$pageview", {
      $current_url: `${window.location.origin}${path}`,
      page_path: path,
    });
  }, [pathname]);

  return null;
}

export function captureProductEvent(name: string, properties?: Record<string, string | number | boolean | null>) {
  if (posthogKey) posthog.capture(name, properties);
}

export function identifyProductUser(userId: string) {
  if (posthogKey) posthog.identify(userId, { platform: "web" });
}

export function resetProductUser() {
  if (posthogKey) posthog.reset();
}

export default function QuestHatPostHogProvider({ children }: { children: React.ReactNode }) {
  if (!posthogKey) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      <PageViewCapture />
      {children}
    </PostHogProvider>
  );
}
