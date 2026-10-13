export const GUEST_ACTION_IDS = Object.freeze({
  VIEW_PROFILE: "view_profile",
  REMOVE: "remove",
  BLOCK: "block",
  REPORT: "report",
});

export function getVisibleGuestActionIds(isManager) {
  return [
    GUEST_ACTION_IDS.VIEW_PROFILE,
    ...(isManager ? [GUEST_ACTION_IDS.REMOVE] : []),
    GUEST_ACTION_IDS.BLOCK,
    GUEST_ACTION_IDS.REPORT,
  ];
}

export function guestActionScope(target) {
  return target ? `${target.questId}:${target.memberId}` : null;
}

export function isGuestActionTargetCurrent(target, questId, memberIds, isManager) {
  return Boolean(
    target
      && target.questId === questId
      && target.isManager === isManager
      && memberIds.includes(target.memberId),
  );
}

export function createGuestActionMenuGate() {
  let generation = 0;
  let pending = false;
  return {
    begin(scope) {
      if (!scope || pending) return null;
      pending = true;
      generation += 1;
      return { generation, scope };
    },
    isCurrent(token, scope) {
      return Boolean(token && pending && token.generation === generation && token.scope === scope);
    },
    finish(token) {
      if (token && token.generation === generation) pending = false;
    },
    invalidate() {
      generation += 1;
      pending = false;
    },
  };
}
