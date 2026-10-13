const HOUR_MS = 60 * 60 * 1000;

export function isCheckInWindowOpen({ startsAt, isVirtual = false, now = Date.now() }) {
  if (isVirtual || !startsAt) return false;
  const startsAtMs = new Date(startsAt).getTime();
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs >= startsAtMs - 4 * HOUR_MS && nowMs <= startsAtMs + 12 * HOUR_MS;
}

export function canShowCheckIn({ isManager, isJoined, isVirtual, startsAt, myCheckIn, now = Date.now() }) {
  return Boolean(
    !isVirtual
    && (isManager || isJoined)
    && (myCheckIn || isCheckInWindowOpen({ startsAt, isVirtual, now })),
  );
}

export function resolveCheckInResult(value) {
  return value && typeof value === "object"
    ? { ok: true, value }
    : { ok: false, message: "Could not confirm check-in. Try again." };
}

export function resolveCheckInUndoResult(changed) {
  return changed === true
    ? { ok: true }
    : { ok: false, message: "This check-in was already removed. Refresh and try again." };
}
