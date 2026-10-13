export type { HomeFeedLoadStatus } from "./home-feed-load";
import type { HomeFeedLoadStatus } from "./home-feed-load";

export function getHomeFeedPresentation(status: HomeFeedLoadStatus, count: number) {
  if (status === "error") return {
    countLabel: "Unavailable",
    title: "Could not load quests",
    copy: "Check your connection and try again. Your last loaded plans are kept until a refresh succeeds.",
  };
  if (status === "loading") return {
    countLabel: "Loading…",
    title: "Loading quests…",
    copy: "Looking for plans nearby.",
  };
  return {
    countLabel: String(count),
    title: "No quests match that yet",
    copy: "Try another category or start the first one yourself.",
  };
}
