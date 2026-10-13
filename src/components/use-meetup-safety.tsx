"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppIcon, type AppIconName } from "./app-icons";
import { meetupSafetyHidden, rememberMeetupSafety } from "@/lib/meetup-safety.js";

type Context = "host" | "guest";
type Pending = { context: Context; userId: string; action?: () => void | Promise<void> };
const sharedPlan = "Tell someone you trust the exact location, who you’re meeting, and when you expect to return. Arrange periodic check-ins and decide what they should do if you miss one.";
export function useMeetupSafety(userId: string | null, onError: (message: string) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [remember, setRemember] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentUser = useRef(userId);
  useEffect(() => { currentUser.current = userId; }, [userId]);
  function storage() { try { return window.localStorage; } catch { return null; } }
  const request = useCallback((context: Context, action?: () => void | Promise<void>) => {
    if (!userId || meetupSafetyHidden(storage(), userId, context)) return false;
    pendingRef.current = { context, userId, action };
    setRemember(false); setPending(pendingRef.current); return true;
  }, [userId]);
  const finish = useCallback((proceed: boolean) => {
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    if (remember) rememberMeetupSafety(storage(), next.userId, next.context);
    setPending(null); setRemember(false);
    if (proceed && next.userId === currentUser.current) {
      void Promise.resolve().then(() => next.action?.()).catch(error => onError(error instanceof Error ? error.message : "Could not continue. Please try again."));
    }
  }, [remember, onError]);
  const closeRef = useRef(() => finish(false));
  useEffect(() => { closeRef.current = () => finish(false); }, [finish]);
  useEffect(() => {
    if (!pending) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key === "Tab") {
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, input') || []);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (before?.isConnected) before.focus(); };
  }, [pending]);
  const host = pending?.context === "host";
  const tips: [AppIconName, string, string][] = host ? [
    ["home", "Choose a public place", "For a first meetup, use a busy, well-lit venue instead of a private home or isolated area."],
    ["people", "Share your plan", sharedPlan],
    ["location", "Protect private details", "Keep your exact address hidden until you approve the right guests. You can revoke access at any time."],
    ["shield", "Stay in control", "Keep your phone charged, arrange your own transportation, and leave, block, or report if anything feels wrong."],
  ] : [
    ["message", "Verify the plan", "Review the host’s profile and quest details. Keep early conversations in QuestHat so you can report concerns."],
    ["home", "Meet in public", "For a first meetup, choose a busy, well-lit place and avoid changing to an isolated location."],
    ["people", "Share your plan", sharedPlan],
    ["location", "Keep an exit plan", "Use your own transportation, keep your phone charged, and leave, block, or report if anything feels wrong."],
  ];
  const dialog = pending ? <div className="meetup-safety-overlay" onClick={event => { if (event.target === event.currentTarget) finish(false); }}>
    <div ref={dialogRef} className="meetup-safety-card" role="dialog" aria-modal="true" aria-labelledby="meetup-safety-heading">
      <header><AppIcon name="shield" /><div><small>SAFER MEETUPS</small><h2 id="meetup-safety-heading">{host ? "Host with a plan" : "Before you join"}</h2><p>{host ? "A few habits can make an in-person quest safer for everyone." : "Take a moment to protect yourself before meeting someone new."}</p></div><button type="button" aria-label="Dismiss safety tips" onClick={() => finish(false)}>×</button></header>
      <div className="meetup-safety-tips">{tips.map(([icon,title,copy]) => <section key={title}><AppIcon name={icon} /><div><h3>{title}</h3><p>{copy}</p></div></section>)}</div>
      <label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Don’t show these {host ? "hosting" : "joining"} tips again</label>
      <button type="button" className="meetup-safety-continue" onClick={() => finish(true)}>{host ? "Got it, create safely" : "Continue to join"} →</button>
      <button type="button" className="meetup-safety-dismiss" onClick={() => finish(false)}>{host ? "Dismiss" : "Not now"}</button>
    </div>
  </div> : null;
  return { requestMeetupSafety: request, meetupSafetyDialog: dialog };
}
