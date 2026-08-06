"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        "error-callback"?: () => void;
        "expired-callback"?: () => void;
        "timeout-callback"?: () => void;
        execution?: "render" | "execute";
        appearance?: "always" | "execute" | "interaction-only";
        size?: "normal" | "compact";
      }) => string;
      execute?: (widgetId: string | HTMLElement) => void;
      reset?: (widgetId?: string | HTMLElement) => void;
      remove?: (widgetId: string | HTMLElement) => void;
    };
  }
}

type Props = {
  onToken: (token: string) => void;
  onReady?: () => void;
  onError?: () => void;
  onExpired?: () => void;
  className?: string;
};

export function TurnstileInvisible({ onToken, onReady, onError, onExpired, className }: Props) {
  const id = useId();
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onExpiredRef = useRef(onExpired);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  onTokenRef.current = onToken;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (!scriptLoaded || !sitekey || !widgetRef.current || !window.turnstile || widgetIdRef.current) return;
    const widgetId = window.turnstile.render(widgetRef.current, {
      sitekey,
      execution: "render",
      appearance: "interaction-only",
      size: "normal",
      callback: (token) => onTokenRef.current(token),
      "error-callback": () => onErrorRef.current?.(),
      "expired-callback": () => onExpiredRef.current?.(),
      "timeout-callback": () => onExpiredRef.current?.(),
    });
    widgetIdRef.current = widgetId;
    onReadyRef.current?.();
    return () => {
      window.turnstile?.remove?.(widgetId);
      widgetIdRef.current = null;
    };
  }, [scriptLoaded, sitekey]);

  useEffect(() => {
    if (!sitekey) {
      console.warn("Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    }
  }, [sitekey]);

  return (
    <div className={className ? `${className} grid gap-2` : "grid gap-2"}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onReady={() => setScriptLoaded(true)}
      />
      <div ref={widgetRef} id={id} className="min-h-[65px] min-w-[300px]" />
      {!sitekey ? <p className="text-xs text-red-600">Turnstile site key is missing.</p> : !scriptLoaded ? <p className="text-xs text-slate-500">Loading verification…</p> : null}
    </div>
  );
}
