import { legacyCatalogPayload } from "./legacy-category-catalog.js";
/** Public catalog metadata only. Identity always uses hobbies.id, never a label. */
export const CATALOG_ICON_KEYS = ["sparkles-outline", "trail-sign-outline", "basketball-outline", "game-controller-outline", "color-palette-outline", "cash-outline", "barbell-outline", "briefcase-outline", "tennisball-outline", "leaf-outline", "book-outline", "musical-notes-outline", "create-outline", "videocam-outline", "people-outline", "globe-outline"] as const;
export type CatalogIcon = typeof CATALOG_ICON_KEYS[number];
export type CatalogCover = { id: string; imageUrl: string; label: string; order: number; activityKey: string; keywords: string[]; mimeType: "image/jpeg" | "image/png" | "image/webp" };
export type CatalogCategory = { id: string; slug: string; name: string; label: string; category: string; order: number; active: boolean; featured: boolean; showInCreate: boolean; showInDiscovery: boolean; parentId: string | null; icon: CatalogIcon; covers: CatalogCover[] };
export type CategoryCatalog = { schemaVersion: 1; revision: string; categories: CatalogCategory[] };
export const EMPTY_CATALOG: CategoryCatalog = { schemaVersion: 1, revision: "unavailable", categories: [] };
export const CATALOG_CACHE_KEY = "questhat.category-catalog.v1";
export const CATALOG_REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const text = (v: unknown, fallback = "") => typeof v === "string" ? v.trim().slice(0, 240) : fallback;
const order = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;
export function catalogIcon(value: unknown): CatalogIcon {
  return CATALOG_ICON_KEYS.includes(value as CatalogIcon) ? value as CatalogIcon : "sparkles-outline";
}
export function publicCatalogImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url.href : null; } catch { return null; }
}
export function parseCategoryCatalog(value: unknown): CategoryCatalog {
  if (!value || typeof value !== "object") throw new Error("Invalid category catalog");
  const input = value as Record<string, unknown>;
  if (input.schema_version !== 1 || !Array.isArray(input.categories)) throw new Error("Unsupported category catalog");
  const ids = new Set<string>();
  const categories = input.categories.map((row: unknown): CatalogCategory => {
    if (!row || typeof row !== "object") throw new Error("Invalid category");
    const r = row as Record<string, unknown>;
    const id = text(r.id), name = text(r.name), label = text(r.label, name);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !label || ids.has(id) || typeof r.is_active !== "boolean") throw new Error("Invalid category identity");
    ids.add(id);
    if (!Array.isArray(r.covers)) throw new Error("Invalid category covers");
    const coverIds = new Set<string>();
    const covers = r.covers.map((c: unknown): CatalogCover => {
      if (!c || typeof c !== "object") throw new Error("Invalid cover");
      const cover = c as Record<string, unknown>, imageUrl = publicCatalogImage(cover.image_url), coverId = text(cover.id);
      if (!imageUrl || !/^[a-zA-Z0-9_-]{1,80}$/.test(coverId) || coverIds.has(coverId)) throw new Error("Invalid public cover");
      coverIds.add(coverId);
      return { id: coverId, imageUrl, label: text(cover.label, label), order: order(cover.sort_order), activityKey: text(cover.activity_key).toLowerCase(), mimeType: cover.image_mime_type === "image/png" || cover.image_mime_type === "image/webp" ? cover.image_mime_type : "image/jpeg", keywords: Array.isArray(cover.keywords) ? cover.keywords.map(k => text(k).toLowerCase()).filter(Boolean) : [] };
    }).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
    return { id, name, label, slug: text(r.slug), category: text(r.category, name), active: r.is_active, order: order(r.sort_order), featured: r.is_featured === true, showInCreate: r.show_in_create !== false, showInDiscovery: r.show_in_discovery !== false, parentId: text(r.parent_hobby_id) || null, icon: catalogIcon(r.icon_key), covers };
  }).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
  return { schemaVersion: 1, revision: text(input.revision), categories };
}
export function catalogCategoryActive(catalog: CategoryCatalog, category: CatalogCategory) {
  const seen = new Set<string>();
  let current: CatalogCategory | undefined = category;
  while (current) {
    if (!current.active || seen.has(current.id)) return false;
    seen.add(current.id);
    if (!current.parentId) return true;
    current = catalog.categories.find(c => c.id === current?.parentId);
  }
  return false;
}
export function catalogChoices(catalog: CategoryCatalog, surface: "create" | "discovery") {
  return catalog.categories.filter(c => catalogCategoryActive(catalog, c) && (surface === "create" ? c.showInCreate : c.showInDiscovery));
}
export function catalogLabel(catalog: CategoryCatalog, id: string | null | undefined, legacyName = "") {
  return catalog.categories.find(c => c.id === id)?.label || legacyName;
}
export function canChooseCategory(catalog: CategoryCatalog, id: string, originalId?: string | null) {
  return Boolean(id && (id === originalId || catalogChoices(catalog, "create").some(c => c.id === id)));
}
export function catalogDefaultCategory(catalog: CategoryCatalog) {
  const choices = catalogChoices(catalog, "create");
  return choices.find(c => c.name.trim().toLowerCase() === "outdoors") || choices.find(c => c.featured) || choices[0];
}
export function catalogCovers(catalog: CategoryCatalog, categoryId: string, activity = "") {
  const category = categoryId ? catalog.categories.find(c => c.id === categoryId) : catalogDefaultCategory(catalog);
  if (!category) return [];
  const query = activity.trim().toLowerCase();
  const specific = category.covers.filter(c => c.activityKey && (c.activityKey === query || c.keywords.some(k => query.includes(k))));
  // A targeted activity replaces the generic rail; never pad with unrelated More images.
  return specific.length ? specific : category.covers.filter(c => !c.activityKey);
}
export type CatalogBackend = { rpc: (name: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>; from: (name: string) => { select: (columns: string) => { order: (column: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> } } };
export async function fetchCategoryCatalog(backend: CatalogBackend): Promise<CategoryCatalog> {
  const response = await backend.rpc("get_quest_category_catalog");
  if (!response.error) return parseCategoryCatalog(response.data);
  // Rollout compatibility only; a failed/empty deployed RPC must never revive choices.
  if (!["PGRST202", "42883"].includes(response.error.code || "")) throw new Error(response.error.message);
  const metadata = await backend.from("hobbies").select("id,slug,name,category,label,sort_order,is_active,is_featured,show_in_create,show_in_discovery,icon_key,parent_hobby_id").order("sort_order");
  if (!metadata.error) {
    if (!Array.isArray(metadata.data)) throw new Error("Invalid category metadata");
    const covers = await backend.from("hobby_covers").select("id,hobby_id,image_url,image_mime_type,label,sort_order,is_active,activity_key,keywords").order("sort_order");
    if (covers.error && !["PGRST205", "42P01"].includes(covers.error.code || "")) throw new Error(covers.error.message);
    const coverRows = Array.isArray(covers.data) ? covers.data as Record<string, unknown>[] : [];
    return parseCategoryCatalog({ schema_version: 1, revision: "compat-metadata", categories: metadata.data.map((r: Record<string, unknown>) => ({ ...r, covers: coverRows.filter(c => c.hobby_id === r.id && c.is_active === true) })) });
  }
  if (!["42703", "PGRST204"].includes(metadata.error.code || "")) throw new Error(metadata.error.message);
  let legacy = await backend.from("hobbies").select("id,slug,name,category,is_active").order("name");
  if (legacy.error && ["42703", "PGRST204"].includes(legacy.error.code || "")) legacy = await backend.from("hobbies").select("id,slug,name,category").order("name");
  if (legacy.error || !Array.isArray(legacy.data)) throw new Error(legacy.error?.message || "Catalog unavailable");
  return parseCategoryCatalog(legacyCatalogPayload(legacy.data));
}
export type CatalogStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
function wireCatalog(c: CategoryCatalog) {
  return { schema_version: 1, revision: c.revision, categories: c.categories.map(r => ({ id: r.id, slug: r.slug, name: r.name, label: r.label, category: r.category, sort_order: r.order, is_active: r.active, is_featured: r.featured, show_in_create: r.showInCreate, show_in_discovery: r.showInDiscovery, parent_hobby_id: r.parentId, icon_key: r.icon, covers: r.covers.map(v => ({ id: v.id, image_url: v.imageUrl, image_mime_type: v.mimeType, label: v.label, sort_order: v.order, activity_key: v.activityKey, keywords: v.keywords })) })) };
}
export class CategoryCatalogClient {
  catalog = EMPTY_CATALOG;
  status: "loading" | "ready" | "offline" = "loading";
  private checkedAt = 0;
  private attemptedAt: number | null = null;
  private pending: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private fetcher: () => Promise<CategoryCatalog>;
  private storage: CatalogStorage;
  private now: () => number;
  constructor(fetcher: () => Promise<CategoryCatalog>, storage: CatalogStorage, now: () => number = Date.now) { this.fetcher = fetcher; this.storage = storage; this.now = now; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { this.listeners.forEach(l => l()); }
  private hydration: Promise<void> | null = null;
  hydrate(): Promise<void> {
    this.hydration ??= this.readCache();
    return this.hydration;
  }
  private async readCache() {
    try { const raw = await this.storage.getItem(CATALOG_CACHE_KEY); if (raw) { const cached = JSON.parse(raw); const oldLegacy = cached.catalog?.revision === "legacy"; this.catalog = parseCategoryCatalog(oldLegacy ? legacyCatalogPayload(cached.catalog.categories) : cached.catalog); this.checkedAt = oldLegacy ? 0 : typeof cached.savedAt === "number" ? Math.min(cached.savedAt, this.now()) : 0; this.status = "ready"; this.notify(); } } catch { /* Corrupt/unavailable storage does not prevent network loading. */ }
  }
  refresh(force = false): Promise<void> {
    if (this.pending) return this.pending;
    const now = this.now();
    if (!force && ((this.status === "ready" && now - this.checkedAt < CATALOG_REFRESH_MS) || (this.attemptedAt !== null && now - this.attemptedAt < RETRY_MS))) return Promise.resolve();
    this.attemptedAt = now;
    this.pending = (async () => {
      try {
        const next = await this.fetcher();
        this.catalog = next; this.checkedAt = this.now(); this.status = "ready"; this.notify();
        try { await this.storage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: this.checkedAt, catalog: wireCatalog(next) })); } catch { /* Memory remains authoritative even when storage is full. */ }
      } catch { this.status = "offline"; this.notify(); }
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
}
