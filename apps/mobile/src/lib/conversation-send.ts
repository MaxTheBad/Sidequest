export type ConversationMode = "public" | "private";

export function conversationThreadKey(userId: string, questId: string, mode: ConversationMode, partnerId?: string | null) {
  return `${userId}:${questId}:${mode}:${mode === "private" ? partnerId || "unknown" : "public"}`;
}

export function saveConversationDraft(
  drafts: Record<string, string>,
  userId: string,
  questId: string,
  mode: ConversationMode,
  partnerId: string | null | undefined,
  text: string,
) {
  const next = { ...drafts };
  const key = conversationThreadKey(userId, questId, mode, partnerId);
  if (text.trim()) next[key] = text;
  else delete next[key];
  return next;
}

export function clearConversationDraft(
  drafts: Record<string, string>,
  userId: string,
  questId: string,
  mode: ConversationMode,
  partnerId?: string | null,
) {
  const next = { ...drafts };
  delete next[conversationThreadKey(userId, questId, mode, partnerId)];
  return next;
}

export function createConversationSendGate() {
  let generation = 0;
  let active: { generation: number; scope: string } | null = null;
  return {
    begin(scope: string) {
      if (!scope || active) return null;
      active = { generation: ++generation, scope };
      return active;
    },
    isCurrent(token: { generation: number; scope: string } | null, scope: string) {
      return Boolean(token && active === token && token.generation === generation && token.scope === scope);
    },
    finish(token: { generation: number; scope: string } | null) {
      if (active === token) active = null;
    },
    reset() {
      generation += 1;
      active = null;
    },
    isSending() { return Boolean(active); },
  };
}
