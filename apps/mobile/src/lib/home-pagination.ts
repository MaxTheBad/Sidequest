export const HOME_SORT_OPTIONS = [
  { value: "soonest", label: "Soonest" },
  { value: "nearest", label: "Nearest" },
  { value: "recent", label: "Just posted" },
] as const;
export type HomeSortMode = (typeof HOME_SORT_OPTIONS)[number]["value"];
export type HomeRpcPageCursor = { source: "rpc"; mode: HomeSortMode; snapshotTime: string; time: string | null; timeMissing: boolean; distanceMiles: number | null; distanceMissing: boolean; id: string };
export type HomeFallbackPageCursor = { source: "fallback"; mode: "recent"; snapshotTime: string; createdAt: string; id: string };
export type HomePageCursor = HomeRpcPageCursor | HomeFallbackPageCursor;
export type HomePageRow = { id: string; starts_at?: string | null; created_at?: string | null; sort_time?: string | null; sort_time_missing?: boolean | null; sort_distance_miles?: number | null; total_count?: number | string | null };
type HomeFeedRpcOptions = { sortMode: HomeSortMode; searchQuery: string; categoryFilter: string; location: { lat: number; lon: number } | null; cursor: HomeRpcPageCursor | null; pageSize: number; snapshotTime: string };
type HomeFallbackQueryBuilder = {
  order(field: string, options: { ascending: boolean }): HomeFallbackQueryBuilder;
  limit(count: number): HomeFallbackQueryBuilder;
  or(filters: string): HomeFallbackQueryBuilder;
};
type HomeFeedRequestResult<T> = { data: readonly T[] | null; error: unknown };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSTGRES_TIMESTAMP_PATTERN = /^[0-9T:.+\-Z]+$/;
function assertValidTimestamp(value: string) { if (!Number.isFinite(Date.parse(value))) throw new Error("Invalid Home page cursor time."); }
function roundedCoordinate(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid browse location.");
  return Math.round(value * 100) / 100;
}
export function prepareHomePage<T extends HomePageRow>(rows: readonly T[], pageSize: number, sortMode: HomeSortMode, snapshotTime: string) {
  assertValidTimestamp(snapshotTime);
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const cursorTime = last?.sort_time ?? null;
  const timeMissing = last?.sort_time_missing ?? cursorTime === null;
  if (last && timeMissing !== (cursorTime === null)) throw new Error("Invalid Home page sort time.");
  const rawTotal = rows[0]?.total_count;
  const parsedTotal = rawTotal === null || rawTotal === undefined ? items.length : Number(rawTotal);
  return {
    items,
    hasMore: rows.length > pageSize && Boolean(last),
    nextCursor: last ? { source: "rpc" as const, mode: sortMode, snapshotTime, time: cursorTime, timeMissing, distanceMiles: last.sort_distance_miles ?? null, distanceMissing: last.sort_distance_miles === null || last.sort_distance_miles === undefined, id: last.id } : null,
    totalCount: Number.isSafeInteger(parsedTotal) && parsedTotal >= 0 ? parsedTotal : items.length,
  };
}
export function homeFallbackCursorFilter(cursor: HomeFallbackPageCursor) {
  if (!UUID_PATTERN.test(cursor.id) || !POSTGRES_TIMESTAMP_PATTERN.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt))) {
    throw new Error("Invalid Home fallback cursor.");
  }
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}
export function applyHomeFallbackPageQuery<T extends HomeFallbackQueryBuilder>(query: T, pageSize: number, cursor: HomeFallbackPageCursor | null): T {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid Home page size.");
  let next = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (cursor) next = next.or(homeFallbackCursorFilter(cursor));
  return next as T;
}
export function prepareHomeFallbackPage<T extends HomePageRow>(rows: readonly T[], pageSize: number, snapshotTime: string) {
  assertValidTimestamp(snapshotTime);
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return {
    items,
    hasMore: rows.length > pageSize && Boolean(last?.created_at),
    nextCursor: last?.created_at ? { source: "fallback" as const, mode: "recent" as const, snapshotTime, createdAt: last.created_at, id: last.id } : null,
  };
}
export function filterBlockedHomePage<T extends { creator_id?: string | null }>(items: readonly T[], excludedCreatorIds: readonly string[]) {
  const excluded = new Set(excludedCreatorIds);
  return items.filter((item) => !excluded.has(item.creator_id || ""));
}
export function isMissingHomeFeedRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  if (candidate.code !== "PGRST202" && candidate.code !== "42883") return false;
  return [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .includes("list_home_quests");
}
export async function requestHomeFeedWithFallback<T>({
  rpcRequest,
  fallbackRequest,
  skipRpc = false,
}: {
  rpcRequest: () => PromiseLike<HomeFeedRequestResult<T>>;
  fallbackRequest: () => PromiseLike<HomeFeedRequestResult<T>>;
  skipRpc?: boolean;
}) {
  if (!skipRpc) {
    const rpcResult = await rpcRequest();
    if (!rpcResult.error) return { rows: [...(rpcResult.data || [])], source: "rpc" as const };
    if (!isMissingHomeFeedRpcError(rpcResult.error)) throw rpcResult.error;
  }
  const fallbackResult = await fallbackRequest();
  if (fallbackResult.error) throw fallbackResult.error;
  return { rows: [...(fallbackResult.data || [])], source: "fallback" as const };
}
export function buildHomeFeedRpcArgs({ sortMode, searchQuery, categoryFilter, location, cursor, pageSize, snapshotTime }: HomeFeedRpcOptions) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid Home page size.");
  assertValidTimestamp(snapshotTime);
  if (cursor) {
    if (cursor.mode !== sortMode) throw new Error("Home page cursor does not match the active sort.");
    if (cursor.snapshotTime !== snapshotTime) throw new Error("Home page cursor does not match the feed snapshot.");
    if (!UUID_PATTERN.test(cursor.id)) throw new Error("Invalid Home page cursor id.");
    if (cursor.timeMissing !== (cursor.time === null)) throw new Error("Invalid Home page cursor time.");
    if (cursor.time !== null) assertValidTimestamp(cursor.time);
    if (cursor.distanceMiles !== null && (!Number.isFinite(cursor.distanceMiles) || cursor.distanceMiles < 0)) throw new Error("Invalid Home page cursor distance.");
    if (sortMode === "nearest" && cursor.distanceMissing !== (cursor.distanceMiles === null)) throw new Error("Invalid Home page cursor distance state.");
  }
  if (sortMode === "nearest" && !location) throw new Error("Choose a location before sorting by nearest.");
  const trimmedSearch = searchQuery.trim().slice(0, 200);
  return { p_sort: sortMode, p_search_query: trimmedSearch || null, p_hobby_id: categoryFilter === "All" ? null : categoryFilter, p_viewer_lat: location ? roundedCoordinate(location.lat, -90, 90) : null, p_viewer_lon: location ? roundedCoordinate(location.lon, -180, 180) : null, p_cursor_time: cursor?.time ?? null, p_cursor_time_missing: cursor?.timeMissing ?? false, p_cursor_distance: cursor?.distanceMiles ?? null, p_cursor_distance_missing: cursor?.distanceMissing ?? false, p_cursor_id: cursor?.id ?? null, p_limit: pageSize + 1, p_now: snapshotTime };
}
export function mergeHomePages<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id) && seen.add(item.id))];
}
export function mergeHomePageCounts(current: Record<string, number>, incoming: Record<string, number>, append: boolean) { return append ? { ...current, ...incoming } : incoming; }
export function createHomeAppendGate() {
  let pending = false;
  return { begin() { if (pending) return false; pending = true; return true; }, end() { pending = false; }, isPending() { return pending; } };
}
