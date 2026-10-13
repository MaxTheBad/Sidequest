const LISTING_RETURN_PATH = /^\/listing\/[0-9a-f-]{36}(?:\?join=1)?$/i;
export const AUTH_RETURN_STORAGE_KEY = "questhat_auth_return_to";

type SessionStorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** Only retain an in-app listing path; never turn an auth handoff into an open redirect. */
export function getSafeAuthReturnPath(value: string | null | undefined): string | null {
  const path = (value || "").trim();
  return LISTING_RETURN_PATH.test(path) ? path : null;
}

export function listingJoinAuthPath(listingId: string): string {
  const returnTo = `/listing/${listingId}?join=1`;
  return `/?auth=1&returnTo=${encodeURIComponent(returnTo)}`;
}

/** Retain only the allow-listed return route while sign-in is pending or retried. */
export function storeAuthReturn(storage: SessionStorageLike, value: string | null | undefined): boolean {
  const path = getSafeAuthReturnPath(value);
  if (!path) return false;
  try { storage.setItem(AUTH_RETURN_STORAGE_KEY, path); return true; }
  catch { return false; }
}

/** Consume before navigating so a retry or later sign-in cannot replay the action. */
export function consumeAuthReturn(storage: SessionStorageLike): string | null {
  try {
    const path = getSafeAuthReturnPath(storage.getItem(AUTH_RETURN_STORAGE_KEY));
    storage.removeItem(AUTH_RETURN_STORAGE_KEY);
    return path;
  } catch { return null; }
}

/** Explicit cancellation returns to browsing and prevents a later sign-in replay. */
export function cancelAuthReturn(storage: SessionStorageLike): string | null {
  return consumeAuthReturn(storage)?.split("?")[0] || null;
}
