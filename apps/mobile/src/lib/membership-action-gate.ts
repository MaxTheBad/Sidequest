export function createMembershipActionGate() {
  const pending = new Set<string>();
  return {
    begin(questId: string) {
      if (pending.has(questId)) return false;
      pending.add(questId);
      return true;
    },
    finish(questId: string) { pending.delete(questId); },
    isPending(questId: string) { return pending.has(questId); },
  };
}
