const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const KNOWN_NOTIFICATION_KINDS = ["message", "join_request", "approval", "declined", "system"];

export function resolveNotificationDestination(data) {
  const href = typeof data?.href === "string" ? data.href : "";
  const questIdFromHref = href.match(/^\/listing\/([0-9a-f-]+)/i)?.[1]
    || href.match(/[?&]thread=([0-9a-f-]+)/i)?.[1]
    || null;
  const rawQuestId = typeof data?.questId === "string" ? data.questId : questIdFromHref;
  const questId = rawQuestId && UUID.test(rawQuestId) ? rawQuestId : null;
  const kind = typeof data?.kind === "string" && KNOWN_NOTIFICATION_KINDS.includes(data.kind) ? data.kind : "";
  const isPrivateMessage = kind === "message" && data?.meta?.private === true;
  const wantsInbox = href.startsWith("/inbox");

  if ((isPrivateMessage || wantsInbox) && questId) return { tab: "inbox", questId, conversation: true };
  if (questId) return { tab: "home", questId, conversation: false };
  return { tab: wantsInbox ? "inbox" : "notifications", questId: null, conversation: false };
}

export function createNotificationPreferenceRequestGate() {
  let sequence = 0;
  let activeUserId = null;
  return {
    begin(userId) {
      activeUserId = userId;
      return { userId, sequence: ++sequence };
    },
    isCurrent(request) {
      return request.userId === activeUserId && request.sequence === sequence;
    },
  };
}
