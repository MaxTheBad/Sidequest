/** Presentation only: membership mutations remain in the existing page handlers. */
export function feedMembershipAction({ isOwner = false, isExpired = false, status = '', isJoined = false, joinMode = 'open' } = {}) {
  if (isOwner) return { label: isExpired ? 'Make again' : 'Hosting', icon: isExpired ? 'refresh' : 'star', disabled: !isExpired, tone: 'joined' };
  if (status === 'pending') return { label: 'Cancel request', icon: 'minus', disabled: false, tone: 'pending' };
  if (isJoined) return { label: 'Leave quest', icon: 'minus', disabled: false, tone: 'joined' };
  if (status === 'declined') return { label: 'Request again', icon: 'refresh', disabled: false, tone: 'ready' };
  return { label: joinMode === 'open' ? 'Join now' : 'Request to join', icon: 'plus', disabled: false, tone: 'ready' };
}

export function feedCountdown(startsAt, now) {
  const remaining = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const total = Math.max(1, Math.ceil(remaining / 60000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  return days ? `Starts in ${days}d ${hours}h` : hours ? `Starts in ${hours}h ${minutes}m` : `Starts in ${minutes}m`;
}
