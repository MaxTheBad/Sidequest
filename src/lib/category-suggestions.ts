export const CANONICAL_CATEGORIES = [
  "Build",
  "Learn",
  "Career",
  "Healthy Lifestyle",
  "Outdoors",
  "Social",
  "Money",
  "Creative",
  "Lifestyle",
  "Wildcard",
] as const;

const ALIAS_TO_CATEGORY: Array<{ alias: string; category: (typeof CANONICAL_CATEGORIES)[number] }> = [
  { alias: "project", category: "Build" },
  { alias: "product", category: "Build" },
  { alias: "startup", category: "Build" },
  { alias: "idea", category: "Build" },

  { alias: "study", category: "Learn" },
  { alias: "studying", category: "Learn" },
  { alias: "learning", category: "Learn" },
  { alias: "course", category: "Learn" },
  { alias: "class", category: "Learn" },

  { alias: "job", category: "Career" },
  { alias: "interview", category: "Career" },
  { alias: "resume", category: "Career" },

  { alias: "gym", category: "Healthy Lifestyle" },
  { alias: "cardio", category: "Healthy Lifestyle" },
  { alias: "fitness", category: "Healthy Lifestyle" },
  { alias: "workout", category: "Healthy Lifestyle" },
  { alias: "wellness", category: "Healthy Lifestyle" },
  { alias: "health", category: "Healthy Lifestyle" },

  { alias: "hike", category: "Outdoors" },
  { alias: "hiking", category: "Outdoors" },
  { alias: "camp", category: "Outdoors" },

  { alias: "relationship", category: "Social" },
  { alias: "communication", category: "Social" },
  { alias: "community", category: "Social" },

  { alias: "budget", category: "Money" },
  { alias: "finance", category: "Money" },
  { alias: "saving", category: "Money" },

  { alias: "writing", category: "Creative" },
  { alias: "photo", category: "Creative" },
  { alias: "music", category: "Creative" },

  { alias: "habit", category: "Lifestyle" },
  { alias: "routine", category: "Lifestyle" },
  { alias: "productivity", category: "Lifestyle" },

  { alias: "other", category: "Wildcard" },
  { alias: "custom", category: "Wildcard" },
  { alias: "random", category: "Wildcard" },
];

export function normalizeCategoryInput(input: string): string {
  return input.trim().toLowerCase();
}

export function resolveCanonicalCategory(input: string): string | null {
  const normalized = normalizeCategoryInput(input);
  if (!normalized) return null;

  const direct = CANONICAL_CATEGORIES.find((c) => c.toLowerCase() === normalized);
  if (direct) return direct;

  const aliasHit = ALIAS_TO_CATEGORY.find(({ alias }) => normalized === alias || normalized.includes(alias));
  return aliasHit?.category || null;
}

export function suggestCanonicalCategories(input: string): string[] {
  const normalized = normalizeCategoryInput(input);
  if (!normalized) return [...CANONICAL_CATEGORIES];

  const starts = CANONICAL_CATEGORIES.filter((c) => c.toLowerCase().startsWith(normalized));
  const aliases = ALIAS_TO_CATEGORY.filter(({ alias }) => alias.includes(normalized)).map(({ category }) => category);
  const all = [...starts, ...aliases];
  return Array.from(new Set(all)).slice(0, 6);
}
