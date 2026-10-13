export function normalizeQuestMediaItems(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || (item.type !== "image" && item.type !== "video") || typeof item.url !== "string" || !item.url.trim()) return [];
    return [{ ...item, url: item.url.trim() }];
  });
}

export function clampMediaIndex(index, itemCount) {
  if (!Number.isFinite(index) || itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, Math.trunc(index)));
}

export function createQuestDetailRequestGate() {
  let generation = 0;
  return {
    begin(questId) {
      generation += 1;
      return { generation, questId };
    },
    isCurrent(request) {
      return request.generation === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}
