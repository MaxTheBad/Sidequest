export const FEED_VIEW_STORAGE_KEY = "sidequest_feed_view_mode";
const CHANGE_EVENT = "questhat-feed-view-changed";
export function readFeedView(target) {
  return target.localStorage.getItem(FEED_VIEW_STORAGE_KEY) === "map" ? "map" : "list";
}
export function publishFeedView(target, mode) {
  if (mode !== "list" && mode !== "map") return;
  target.localStorage.setItem(FEED_VIEW_STORAGE_KEY, mode);
  target.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
}
export function subscribeFeedView(target, onChange) {
  const sync = () => onChange(readFeedView(target));
  const storage = event => { if (event.key === FEED_VIEW_STORAGE_KEY || event.key === null) sync(); };
  target.addEventListener(CHANGE_EVENT, sync);
  target.addEventListener("storage", storage);
  sync();
  return () => {
    target.removeEventListener(CHANGE_EVENT, sync);
    target.removeEventListener("storage", storage);
  };
}
