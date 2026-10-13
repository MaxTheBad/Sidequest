"use client";
import { useSyncExternalStore } from "react";
import { publishFeedView, readFeedView, subscribeFeedView } from "./feed-view.js";

const serverSnapshot = () => "list" as const;
const browserSnapshot = (): "list" | "map" => typeof window === "undefined" ? "list" : readFeedView(window);
const subscribe = (notify: () => void) => subscribeFeedView(window, notify);
const setMode = (next: "list" | "map" | ((current: "list" | "map") => "list" | "map")) => publishFeedView(window, typeof next === "function" ? next(browserSnapshot()) : next);

/** Hydrate the server's list first, then restore the persisted browser preference. */
export function useHydratedFeedView() {
  const mode = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  return [mode, setMode] as const;
}
