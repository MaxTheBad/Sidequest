export const CANONICAL_CATEGORIES = [
  "Build",
  "Learn",
  "Career",
  "Healthy Lifestyle",
  "Outdoors",
  "Social",
  "Community",
  "Money",
  "Creative",
  "Arts & Crafts",
  "Book club",
  "Sewing",
  "Music / Producer",
  "Fishing",
  "Painting",
  "Lifestyle",
  "Wildcard",
];

const ALIAS_TO_CATEGORY = [
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
  { alias: "worship", category: "Community" },
  { alias: "church", category: "Community" },
  { alias: "civic", category: "Community" },
  { alias: "civic center", category: "Community" },
  { alias: "volunteer", category: "Community" },
  { alias: "volunteering", category: "Community" },
  { alias: "service", category: "Community" },
  { alias: "event partner", category: "Community" },
  { alias: "event", category: "Community" },
  { alias: "neighborhood", category: "Community" },
  { alias: "local org", category: "Community" },
  { alias: "community", category: "Community" },
  { alias: "budget", category: "Money" },
  { alias: "finance", category: "Money" },
  { alias: "saving", category: "Money" },
  { alias: "writing", category: "Creative" },
  { alias: "photo", category: "Creative" },
  { alias: "paint", category: "Painting" },
  { alias: "painting", category: "Painting" },
  { alias: "canvas", category: "Painting" },
  { alias: "brush", category: "Painting" },
  { alias: "acrylic", category: "Painting" },
  { alias: "art", category: "Arts & Crafts" },
  { alias: "craft", category: "Arts & Crafts" },
  { alias: "diy", category: "Arts & Crafts" },
  { alias: "book club", category: "Book club" },
  { alias: "books", category: "Book club" },
  { alias: "reading", category: "Book club" },
  { alias: "sewing", category: "Sewing" },
  { alias: "stitch", category: "Sewing" },
  { alias: "fabric", category: "Sewing" },
  { alias: "music", category: "Music / Producer" },
  { alias: "producer", category: "Music / Producer" },
  { alias: "beat", category: "Music / Producer" },
  { alias: "song", category: "Music / Producer" },
  { alias: "fish", category: "Fishing" },
  { alias: "fishing", category: "Fishing" },
  { alias: "angler", category: "Fishing" },
  { alias: "angling", category: "Fishing" },
  { alias: "bait", category: "Fishing" },
  { alias: "habit", category: "Lifestyle" },
  { alias: "routine", category: "Lifestyle" },
  { alias: "productivity", category: "Lifestyle" },
  { alias: "other", category: "Wildcard" },
  { alias: "custom", category: "Wildcard" },
  { alias: "random", category: "Wildcard" },
];

export function normalizeCategoryInput(input) {
  return input.trim().toLowerCase();
}

export function resolveCanonicalCategory(input) {
  const normalized = normalizeCategoryInput(input);
  if (!normalized) return null;

  const direct = CANONICAL_CATEGORIES.find((c) => c.toLowerCase() === normalized);
  if (direct) return direct;

  const aliasHit = ALIAS_TO_CATEGORY.find(({ alias }) => normalized === alias || normalized.includes(alias));
  return aliasHit?.category || null;
}

export function suggestCanonicalCategories(input) {
  const normalized = normalizeCategoryInput(input);
  if (!normalized) return [...CANONICAL_CATEGORIES];

  const starts = CANONICAL_CATEGORIES.filter((c) => c.toLowerCase().startsWith(normalized));
  const aliases = ALIAS_TO_CATEGORY.filter(({ alias }) => alias.includes(normalized)).map(({ category }) => category);
  const all = [...starts, ...aliases];
  return Array.from(new Set(all)).slice(0, 6);
}
