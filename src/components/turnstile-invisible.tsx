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
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!scriptLoaded || !sitekey || !widgetRef.current || !window.turnstile || widgetIdRef.current) return;
    const widgetId = window.turnstile.render(widgetRef.current, {
      sitekey,
      execution: "render",
      appearance: "interaction-only",
      size: "normal",
      callback: (token) => onToken(token),
      "error-callback": onError,
      "expired-callback": onExpired,
      "timeout-callback": onExpired,
    });
    widgetIdRef.current = widgetId;
    onReady?.();
  }, [onError, onExpired, onReady, onToken, scriptLoaded, sitekey]);

  useEffect(() => {
    if (!sitekey) {
      console.warn("Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    }
  }, [sitekey]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset?.(widgetIdRef.current);
    onToken("");
  }, [onToken]);

  return (
    <div className={className ? `${className} grid gap-2` : "grid gap-2"}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={widgetRef} id={id} className="min-h-[65px] min-w-[300px]" />
      {!sitekey ? <p className="text-xs text-red-600">Turnstile site key is missing.</p> : !scriptLoaded ? <p className="text-xs text-slate-500">Loading verification…</p> : null}
    </div>
  );
}
