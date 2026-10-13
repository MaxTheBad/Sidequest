export function normalizeHomeCategoryFilter(categoryFilter, availableCategoryIds) {
  if (categoryFilter === "All") return "All";
  return availableCategoryIds.includes(categoryFilter) ? categoryFilter : "All";
}

export function filterHomeQuests({ quests, query, categoryFilter, categoryLabel, profileLabel }) {
  const normalizedQuery = query.trim().toLowerCase();
  const seen = new Set();
  return quests.filter((quest) => {
    if (!quest?.id || seen.has(quest.id)) return false;
    seen.add(quest.id);
    if (categoryFilter !== "All" && quest.hobby_id !== categoryFilter) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      quest.title,
      quest.description,
      quest.city,
      quest.availability,
      categoryLabel(quest),
      profileLabel(quest)?.display_name,
      profileLabel(quest)?.username,
    ].filter(Boolean).join(" ").toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}
