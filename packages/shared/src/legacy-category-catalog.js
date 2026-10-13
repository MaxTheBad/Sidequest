// Read-only rollout compatibility for actual legacy hobbies rows. Never invent DB IDs.
import { CATEGORY_FALLBACK_MEDIA } from "./category-content.ts";
import { LEGACY_COVER_PATHS } from "./legacy-cover-manifest.js";
/** @type {Record<string, { icon: string; featured?: boolean; order?: number; folder?: string; fallback?: keyof typeof CATEGORY_FALLBACK_MEDIA }>} */
const defaults = {
 outdoors: { icon: "trail-sign-outline", featured: true, order: 0, folder: "outdoors" },
 creative: { icon: "videocam-outline", featured: true, order: 10, fallback: "Creative" },
 "arts & crafts": { icon: "color-palette-outline", fallback: "Arts & Crafts" },
 "arts & creative": { icon: "color-palette-outline", featured: true, order: 10, folder: "arts-creative" },
 tennis: { icon: "tennisball-outline", featured: true, order: 20, fallback: "Tennis" },
 sports: { icon: "basketball-outline", featured: true, order: 20, folder: "sports" },
 games: { icon: "game-controller-outline", featured: true, order: 30, folder: "games" },
 build: { icon: "briefcase-outline", featured: true, order: 30, fallback: "Build" },
 money: { icon: "cash-outline", featured: true, order: 40, folder: "money" },
 "healthy lifestyle": { icon: "barbell-outline", featured: true, order: 50, fallback: "Healthy Lifestyle" },
 fitness: { icon: "barbell-outline", featured: true, order: 50, folder: "fitness" },
 gym: { icon: "barbell-outline", fallback: "Healthy Lifestyle" },
 running: { icon: "barbell-outline", fallback: "Healthy Lifestyle" },
 sewing: { icon: "create-outline", fallback: "Sewing" },
 community: { icon: "people-outline", fallback: "Community" },
 social: { icon: "people-outline", fallback: "Social" },
 career: { icon: "briefcase-outline", fallback: "Career" },
 learn: { icon: "book-outline", fallback: "Learn" },
 "book club": { icon: "book-outline", fallback: "Book club" },
 "music / producer": { icon: "musical-notes-outline", fallback: "Music / Producer" },
 fishing: { icon: "leaf-outline", fallback: "Fishing" },
 lifestyle: { icon: "leaf-outline", fallback: "Lifestyle" },
 pickleball: { icon: "tennisball-outline", fallback: "Pickleball" },
 climbing: { icon: "trail-sign-outline" },
 pool: { icon: "game-controller-outline" },
 "table tennis": { icon: "game-controller-outline" },
};
/** @param {Record<string, unknown>[]} rows */
export function legacyCatalogPayload(rows) {
 return { schema_version: 1, revision: "legacy-compatible-v3", categories: rows.map((r, index) => {
  const name = typeof r.name === "string" ? r.name : "";
  const definition = defaults[name.trim().toLowerCase()];
  const paths = LEGACY_COVER_PATHS[name.trim().toLowerCase()] ?? (definition?.folder ? Array.from({ length: 6 }, (_, n) => `/create-quest/categories/${definition.folder}/cover-${String(n).padStart(2, "0")}.jpg`) : definition?.fallback ? [CATEGORY_FALLBACK_MEDIA[definition.fallback].imagePath] : []);
  return { ...r, label: name, is_active: r.is_active !== false, show_in_create: true, show_in_discovery: true, is_featured: definition?.featured === true, sort_order: definition?.order ?? 100 + index, icon_key: definition?.icon || "sparkles-outline", covers: paths.map((path, n) => ({ id: `legacy-${r.id}-${n}`, image_url: `https://questhat.com${path}`, label: `${name} ${n+1}`, sort_order: n, activity_key: "", keywords: [], image_mime_type: "image/jpeg" })) };
 }) };
}
