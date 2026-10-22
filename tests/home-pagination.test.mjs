import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyHomeFallbackPageQuery,
  buildHomeFeedRpcArgs,
  createHomeAppendGate,
  filterBlockedHomePage,
  HOME_SORT_OPTIONS,
  homeFallbackCursorFilter,
  isMissingHomeFeedRpcError,
  mergeHomePageCounts,
  mergeHomePages,
  prepareHomeFallbackPage,
  prepareHomePage,
  requestHomeFeedWithFallback,
} from "../apps/mobile/src/lib/home-pagination.ts";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/migrations/20261010195314_server_sorted_home_feed.sql", import.meta.url), "utf8");
const startExpiryMigrationSource = readFileSync(new URL("../supabase/migrations/20261022052000_start_based_quest_discovery.sql", import.meta.url), "utf8");
const accountLifecycleSource = readFileSync(new URL("../supabase/migrations/20260730151500_account_lifecycle.sql", import.meta.url), "utf8");
const safetySource = readFileSync(new URL("../supabase/migrations/20260730160000_eula_and_safety_enforcement.sql", import.meta.url), "utf8");
const SNAPSHOT_TIME = "2026-10-10T20:00:00.000Z";

function row(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(100000000000 + index).padStart(12, "0")}`,
    starts_at: `2026-10-${String(11 + Math.floor(index / 24)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    created_at: `2026-10-${String(9 - Math.floor(index / 24)).padStart(2, "0")}T${String(23 - (index % 24)).padStart(2, "0")}:00:00.000Z`,
    sort_time: `2026-10-${String(11 + Math.floor(index / 24)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    sort_time_missing: false,
    sort_distance_miles: index / 10,
    total_count: 231,
    ...overrides,
  };
}

test("sort options preserve the approved menu order", () => {
  assert.deepEqual(HOME_SORT_OPTIONS.map(({ value, label }) => [value, label]), [
    ["soonest", "Soonest"],
    ["nearest", "Nearest"],
    ["recent", "Just posted"],
  ]);
});

test("lookahead pagination returns stable sort-specific cursors and the server total", () => {
  const rows = Array.from({ length: 51 }, (_, index) => row(index));
  for (const mode of ["soonest", "nearest", "recent"]) {
    const page = prepareHomePage(rows, 50, mode, SNAPSHOT_TIME);
    assert.equal(page.items.length, 50);
    assert.equal(page.hasMore, true);
    assert.equal(page.totalCount, 231);
    assert.equal(page.nextCursor.mode, mode);
    assert.equal(page.nextCursor.id, rows[49].id);
    assert.equal(page.nextCursor.snapshotTime, SNAPSHOT_TIME);
    assert.equal(page.nextCursor.time, rows[49].sort_time);
    assert.equal(page.nextCursor.timeMissing, false);
    assert.equal(page.nextCursor.distanceMiles, rows[49].sort_distance_miles);
  }
  const unavailable = prepareHomePage([row(0, { sort_distance_miles: null })], 50, "nearest", SNAPSHOT_TIME);
  assert.equal(unavailable.nextCursor.distanceMissing, true);
  assert.equal(unavailable.nextCursor.distanceMiles, null);
});

test("RPC arguments combine filters, bound the page, and reduce device precision", () => {
  const args = buildHomeFeedRpcArgs({
    sortMode: "nearest",
    searchQuery: "  climbing Friday  ",
    categoryFilter: "00000000-0000-4000-8000-000000000123",
    location: { lat: 30.267153, lon: -97.743057 },
    cursor: null,
    pageSize: 50,
    snapshotTime: SNAPSHOT_TIME,
  });
  assert.equal(args.p_search_query, "climbing Friday");
  assert.equal(args.p_hobby_id, "00000000-0000-4000-8000-000000000123");
  assert.equal(args.p_viewer_lat, 30.27);
  assert.equal(args.p_viewer_lon, -97.74);
  assert.equal(args.p_limit, 51);
  assert.equal(args.p_now, SNAPSHOT_TIME);
  assert.equal(args.p_cursor_time_missing, false);
});

test("RPC arguments exactly match the deployed list_home_quests contract", () => {
  const args = buildHomeFeedRpcArgs({
    sortMode: "soonest",
    searchQuery: "",
    categoryFilter: "All",
    location: null,
    cursor: null,
    pageSize: 50,
    snapshotTime: SNAPSHOT_TIME,
  });
  assert.deepEqual(Object.keys(args).sort(), [
    "p_cursor_distance",
    "p_cursor_distance_missing",
    "p_cursor_id",
    "p_cursor_time",
    "p_cursor_time_missing",
    "p_hobby_id",
    "p_limit",
    "p_now",
    "p_search_query",
    "p_sort",
    "p_viewer_lat",
    "p_viewer_lon",
  ]);
  assert.match(migrationSource, /create or replace function public\.list_home_quests\(\s*p_sort text,\s*p_search_query text,\s*p_hobby_id uuid,\s*p_viewer_lat double precision,\s*p_viewer_lon double precision,\s*p_cursor_time timestamptz,\s*p_cursor_time_missing boolean,\s*p_cursor_distance double precision,\s*p_cursor_distance_missing boolean,\s*p_cursor_id uuid,\s*p_limit integer,\s*p_now timestamptz\s*\)/);
});

test("normal RPC responses remain server-ranked and do not invoke the compatibility query", async () => {
  let fallbackCalls = 0;
  const expectedRows = [row(0), row(1)];
  const result = await requestHomeFeedWithFallback({
    rpcRequest: async () => ({ data: expectedRows, error: null }),
    fallbackRequest: async () => { fallbackCalls += 1; return { data: [], error: null }; },
  });
  assert.equal(result.source, "rpc");
  assert.deepEqual(result.rows, expectedRows);
  assert.equal(fallbackCalls, 0);
});

test("only a missing list_home_quests function activates the compatibility query", async () => {
  const missingRpc = {
    code: "PGRST202",
    message: "Could not find the function public.list_home_quests in the schema cache",
  };
  assert.equal(isMissingHomeFeedRpcError(missingRpc), true);
  const result = await requestHomeFeedWithFallback({
    rpcRequest: async () => ({ data: null, error: missingRpc }),
    fallbackRequest: async () => ({ data: [row(2)], error: null }),
  });
  assert.equal(result.source, "fallback");
  assert.deepEqual(result.rows, [row(2)]);
});

test("auth, RLS, network, and unrelated missing-function errors are not masked", async () => {
  const errors = [
    { code: "42501", message: "permission denied for function list_home_quests" },
    { code: "PGRST301", message: "JWT expired" },
    { message: "Network request failed" },
    { code: "PGRST202", message: "Could not find the function public.other_function" },
  ];
  for (const expectedError of errors) {
    let fallbackCalls = 0;
    await assert.rejects(
      requestHomeFeedWithFallback({
        rpcRequest: async () => ({ data: null, error: expectedError }),
        fallbackRequest: async () => { fallbackCalls += 1; return { data: [], error: null }; },
      }),
      (actual) => actual === expectedError,
    );
    assert.equal(fallbackCalls, 0);
  }
});

test("nearest never fabricates an origin and cursors cannot cross sort modes", () => {
  assert.throws(() => buildHomeFeedRpcArgs({
    sortMode: "nearest", searchQuery: "", categoryFilter: "All", location: null, cursor: null, pageSize: 50, snapshotTime: SNAPSHOT_TIME,
  }), /Choose a location/);
  assert.throws(() => buildHomeFeedRpcArgs({
    sortMode: "soonest",
    searchQuery: "",
    categoryFilter: "All",
    location: null,
    cursor: { mode: "recent", snapshotTime: SNAPSHOT_TIME, time: "2026-10-10T20:00:00Z", timeMissing: false, distanceMiles: null, distanceMissing: true, id: row(0).id },
    pageSize: 50,
    snapshotTime: SNAPSHOT_TIME,
  }), /does not match/);
  assert.throws(() => buildHomeFeedRpcArgs({
    sortMode: "soonest",
    searchQuery: "",
    categoryFilter: "All",
    location: null,
    cursor: { mode: "soonest", snapshotTime: SNAPSHOT_TIME, time: "2026-10-10T20:00:00Z", timeMissing: false, distanceMiles: null, distanceMissing: true, id: `${row(0).id}),title.eq.secret` },
    pageSize: 50,
    snapshotTime: SNAPSHOT_TIME,
  }), /cursor id/);
  assert.throws(() => buildHomeFeedRpcArgs({
    sortMode: "nearest",
    searchQuery: "",
    categoryFilter: "All",
    location: { lat: 30.27, lon: -97.74 },
    cursor: { mode: "nearest", snapshotTime: SNAPSHOT_TIME, time: null, timeMissing: false, distanceMiles: null, distanceMissing: true, id: row(0).id },
    pageSize: 50,
    snapshotTime: SNAPSHOT_TIME,
  }), /cursor time/);
  assert.throws(() => buildHomeFeedRpcArgs({
    sortMode: "nearest",
    searchQuery: "",
    categoryFilter: "All",
    location: { lat: 30.27, lon: -97.74 },
    cursor: { mode: "nearest", snapshotTime: SNAPSHOT_TIME, time: SNAPSHOT_TIME, timeMissing: false, distanceMiles: null, distanceMissing: false, id: row(0).id },
    pageSize: 50,
    snapshotTime: SNAPSHOT_TIME,
  }), /distance state/);
});

test("page cursors freeze the reset snapshot and reject append drift", () => {
  const page = prepareHomePage([row(0), row(1)], 1, "soonest", SNAPSHOT_TIME);
  const cursor = page.nextCursor;
  const args = buildHomeFeedRpcArgs({
    sortMode: "soonest",
    searchQuery: "",
    categoryFilter: "All",
    location: null,
    cursor,
    pageSize: 1,
    snapshotTime: SNAPSHOT_TIME,
  });
  assert.equal(args.p_now, SNAPSHOT_TIME);
  assert.equal(args.p_cursor_time, row(0).sort_time);
  assert.throws(() => buildHomeFeedRpcArgs({
    sortMode: "soonest",
    searchQuery: "",
    categoryFilter: "All",
    location: null,
    cursor,
    pageSize: 1,
    snapshotTime: "2026-10-10T20:01:00.000Z",
  }), /feed snapshot/);
});

test("nullable sort keys still produce an append cursor and bounded page", () => {
  const rows = Array.from({ length: 3 }, (_, index) => row(index, {
    starts_at: null,
    created_at: null,
    sort_time: null,
    sort_time_missing: true,
    sort_distance_miles: null,
  }));
  const page = prepareHomePage(rows, 2, "nearest", SNAPSHOT_TIME);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor.time, null);
  assert.equal(page.nextCursor.timeMissing, true);
  assert.equal(page.nextCursor.distanceMissing, true);
  const args = buildHomeFeedRpcArgs({
    sortMode: "nearest",
    searchQuery: "",
    categoryFilter: "All",
    location: { lat: 30.27, lon: -97.74 },
    cursor: page.nextCursor,
    pageSize: 2,
    snapshotTime: SNAPSHOT_TIME,
  });
  assert.equal(args.p_cursor_time, null);
  assert.equal(args.p_cursor_time_missing, true);
  assert.equal(args.p_cursor_distance_missing, true);
});

test("equal visible sort keys retain the final id boundary", () => {
  const equalTime = "2026-10-11T09:00:00.000Z";
  const rows = Array.from({ length: 3 }, (_, index) => row(index, {
    sort_time: equalTime,
    sort_distance_miles: 4.25,
  }));
  const page = prepareHomePage(rows, 2, "nearest", SNAPSHOT_TIME);
  assert.equal(page.nextCursor.time, equalTime);
  assert.equal(page.nextCursor.distanceMiles, 4.25);
  assert.equal(page.nextCursor.id, rows[1].id);
  assert.match(migrationSource, /counted\.sort_distance_miles = p_cursor_distance[\s\S]*counted\.sort_time = p_cursor_time and counted\.id > p_cursor_id/);
});

test("overlapping pages deduplicate without changing server order", () => {
  const merged = mergeHomePages([row(0), row(1)], [row(1), row(2), row(2)]);
  assert.deepEqual(merged.map((item) => item.id), [row(0).id, row(1).id, row(2).id]);
});

test("compatibility paging keeps the canonical created-at boundary before block filtering", () => {
  class MockQuery {
    operations = [];
    order(field, options) { this.operations.push(["order", field, options]); return this; }
    limit(count) { this.operations.push(["limit", count]); return this; }
    or(filters) { this.operations.push(["or", filters]); return this; }
  }
  const raw = Array.from({ length: 51 }, (_, index) => ({
    ...row(index),
    creator_id: index < 4 ? "blocked-user" : "visible-user",
  }));
  const first = prepareHomeFallbackPage(raw, 50, SNAPSHOT_TIME);
  const visible = filterBlockedHomePage(first.items, ["blocked-user"]);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor.id, raw[49].id);
  assert.equal(visible.length, 46);
  assert.equal(visible.some((item) => item.id === raw[50].id), false);

  const query = new MockQuery();
  assert.equal(applyHomeFallbackPageQuery(query, 50, first.nextCursor), query);
  assert.deepEqual(query.operations, [
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["limit", 51],
    ["or", homeFallbackCursorFilter(first.nextCursor)],
  ]);
  assert.throws(() => homeFallbackCursorFilter({ ...first.nextCursor, id: `${first.nextCursor.id}),title.eq.secret` }), /Invalid Home fallback cursor/);
});

test("append counts and request gate remain retry safe", () => {
  assert.deepEqual(mergeHomePageCounts({ first: 2 }, { second: 1 }, true), { first: 2, second: 1 });
  assert.deepEqual(mergeHomePageCounts({ first: 2 }, { second: 1 }, false), { second: 1 });
  const gate = createHomeAppendGate();
  assert.equal(gate.begin(), true);
  assert.equal(gate.begin(), false);
  gate.end();
  assert.equal(gate.begin(), true);
});

test("native feed prefers server ranking and contains a narrowly scoped compatibility path", () => {
  assert.match(appSource, /client\.rpc\("list_home_quests", buildHomeFeedRpcArgs\(/);
  assert.match(appSource, /searchQuery: homeSearchQuery/);
  assert.match(appSource, /categoryFilter: homeCategoryFilter/);
  assert.match(appSource, /sortMode: homeSortMode/);
  assert.match(appSource, /const sortedPoints = points;/);
  assert.match(appSource, /renderMapView\(quests\)/);
  assert.match(appSource, /result\.source === "fallback"[\s\S]*filterHomeQuests\(/);
  assert.match(appSource, /setQuests\(\(current\) => mergeHomePages\(current, nextQuests\)\)/);
  assert.match(appSource, /homeAppendGate\.begin\(\)/);
  assert.match(appSource, /const snapshotTime = cursor\?\.snapshotTime \?\? new Date\(\)\.toISOString\(\)/);
  assert.match(appSource, /snapshotTime,/);
  assert.match(appSource, /requestHomeFeedWithFallback<QuestPreview>/);
  assert.match(appSource, /applyHomeFallbackPageQuery\(client/);
  assert.match(appSource, /starts_at\.is\.null,starts_at\.gt\.\$\{snapshotTime\}/);
  assert.match(appSource, /filterBlockedHomePage\(fallbackPage\.items, excludedCreatorIds\)/);
  assert.match(appSource, /if \(!homeFeedRequestGate\.isCurrent\(requestId\)\) return/);
  assert.match(appSource, /loadQuestCardCounts\(nextQuests\.map/);
  assert.match(appSource, /homeFeedUsesCompatibilityFallback \? "recent" : homeSortMode/);
  assert.match(appSource, /disabled=\{homeFeedUsesCompatibilityFallback\}/);
});

test("approved compact sort menu is accessible and reloads when discovery inputs change", () => {
  assert.match(appSource, /Sort: \{HOME_SORT_OPTIONS\.find/);
  assert.match(appSource, /accessibilityLabel=\{`Sort quests, currently/);
  assert.match(appSource, /accessibilityState=\{\{ expanded: homeSortMenuVisible, disabled: homeFeedUsesCompatibilityFallback \}\}/);
  assert.match(appSource, /accessibilityRole="menuitem"/);
  assert.match(appSource, /Choose a location to sort quests by nearest/);
  assert.match(appSource, /\[activeTab, homeCategoryFilter, homeSearchQuery, homeSortMode, nearestLocationRefreshKey\]/);
});

test("start-based discovery expires dated quests while preserving undated quests", () => {
  assert.match(startExpiryMigrationSource, /q\.status in \('open', 'full'\)/);
  assert.match(startExpiryMigrationSource, /q\.completed_at is null/);
  assert.match(startExpiryMigrationSource, /q\.starts_at is null or q\.starts_at > p_now/);
  assert.match(startExpiryMigrationSource, /when eligible\.starts_at is null then null/);
  assert.doesNotMatch(startExpiryMigrationSource, /when eligible\.starts_at <= p_now then p_now/);
  assert.match(startExpiryMigrationSource, /paged\.sort_time_missing/);
  assert.match(startExpiryMigrationSource, /paged\.sort_time end desc nulls last/);
});

test("unapplied migration filters before bounded keyset pagination and preserves auth and location privacy", () => {
  assert.match(migrationSource, /security invoker/i);
  assert.match(migrationSource, /p_hobby_id is null or q\.hobby_id = p_hobby_id/);
  assert.match(migrationSource, /search_needle/);
  assert.match(migrationSource, /count\(\*\) over \(\) as total_count/);
  assert.match(migrationSource, /limit p_limit/);
  assert.match(migrationSource, /q\.exact_location_visibility = 'public'/);
  assert.match(migrationSource, /counted\.sort_distance_miles is null/);
  assert.doesNotMatch(migrationSource, /quest_private_locations/);
  assert.match(migrationSource, /grant execute[\s\S]*to anon, authenticated/);
  const categoryFilterIndex = migrationSource.indexOf("p_hobby_id is null or q.hobby_id = p_hobby_id");
  const searchFilterIndex = migrationSource.indexOf("search_needle = ''");
  const countIndex = migrationSource.indexOf("count(*) over ()");
  const cursorIndex = migrationSource.indexOf("where p_cursor_id is null");
  assert.ok(categoryFilterIndex > 0 && searchFilterIndex > categoryFilterIndex);
  assert.ok(countIndex > searchFilterIndex && cursorIndex > countIndex, "combined filters must precede count and cursor pagination");
  assert.match(accountLifecycleSource, /create policy quests_visible_active_creators[\s\S]*on public\.quests for select/);
  assert.match(accountLifecycleSource, /create policy profiles_visible_accounts[\s\S]*on public\.profiles for select/);
  assert.match(safetySource, /create policy quests_hide_blocked_creators[\s\S]*as restrictive for select to authenticated/);
});
