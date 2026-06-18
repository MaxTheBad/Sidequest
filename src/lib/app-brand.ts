export const APP_NAME = "GatherGo";
export const APP_LEGACY_NAME = "Side Quest";

export const APP_NAMESPACE = "gathergo";
export const APP_LEGACY_NAMESPACE = "sidequest";

export const APP_OPEN_AUTH_EVENT = `${APP_NAMESPACE}:open-auth`;
export const APP_OPEN_CREATE_EVENT = `${APP_NAMESPACE}:open-create`;

export const APP_LEGACY_OPEN_AUTH_EVENT = `${APP_LEGACY_NAMESPACE}:open-auth`;
export const APP_LEGACY_OPEN_CREATE_EVENT = `${APP_LEGACY_NAMESPACE}:open-create`;

export const APP_EVENT_NAMES = {
  openAuth: [APP_OPEN_AUTH_EVENT, APP_LEGACY_OPEN_AUTH_EVENT],
  openCreate: [APP_OPEN_CREATE_EVENT, APP_LEGACY_OPEN_CREATE_EVENT],
} as const;

export function dispatchAppEvent(eventName: "open-auth" | "open-create") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`${APP_NAMESPACE}:${eventName}`));
  window.dispatchEvent(new CustomEvent(`${APP_LEGACY_NAMESPACE}:${eventName}`));
}
