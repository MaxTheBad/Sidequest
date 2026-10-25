import { nextQuestJoinBoundary } from "./quest-join-eligibility.js";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function createQuestJoinClock({
  quest, onTick, now = () => Date.now(),
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutFn = (timer) => clearTimeout(timer),
  windowTarget = typeof window === "undefined" ? null : window,
  documentTarget = typeof document === "undefined" ? null : document,
}) {
  let disposed = false;
  let timer = null;
  const clearTimer = () => {
    if (timer === null) return;
    clearTimeoutFn(timer);
    timer = null;
  };
  const refreshAndSchedule = () => {
    if (disposed) return;
    clearTimer();
    const current = now();
    onTick(current);
    const boundary = nextQuestJoinBoundary(quest, current);
    if (boundary === null) return;
    timer = setTimeoutFn(refreshAndSchedule, Math.min(Math.max(0, boundary - current), MAX_TIMEOUT_MS));
  };
  const refreshWhenVisible = () => {
    if (documentTarget?.visibilityState === "visible") refreshAndSchedule();
  };
  windowTarget?.addEventListener("focus", refreshAndSchedule);
  windowTarget?.addEventListener("pageshow", refreshAndSchedule);
  documentTarget?.addEventListener("visibilitychange", refreshWhenVisible);
  refreshAndSchedule();
  return () => {
    disposed = true;
    clearTimer();
    windowTarget?.removeEventListener("focus", refreshAndSchedule);
    windowTarget?.removeEventListener("pageshow", refreshAndSchedule);
    documentTarget?.removeEventListener("visibilitychange", refreshWhenVisible);
  };
}
