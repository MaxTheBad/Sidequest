import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  beginHomeFeedLoad,
  createHomeFeedRequestGate,
  rejectHomeFeedLoad,
  resolveHomeFeedLoad,
  withHomeFeedTimeout,
} from "../apps/mobile/src/lib/home-feed-load.ts";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");

test("initial Home feed failure reaches error without fabricating cached data", () => {
  const loading = beginHomeFeedLoad({ data: [], requestId: 0, status: "ready" });
  const failed = rejectHomeFeedLoad(loading, loading.requestId);
  assert.deepEqual(failed, { data: [], requestId: 1, status: "error" });
});

test("failed refresh retains stale feed data for retry", () => {
  const existing = [{ id: "existing" }];
  const loading = beginHomeFeedLoad({ data: existing, requestId: 4, status: "ready" });
  const failed = rejectHomeFeedLoad(loading, loading.requestId);
  assert.equal(failed.status, "error");
  assert.equal(failed.data, existing);
});

test("retry success replaces stale data and retry failure keeps the last successful feed", () => {
  const first = beginHomeFeedLoad({ data: [{ id: "old" }], requestId: 1, status: "ready" });
  const recovered = resolveHomeFeedLoad(first, first.requestId, [{ id: "fresh" }]);
  const retry = beginHomeFeedLoad(recovered);
  const failedRetry = rejectHomeFeedLoad(retry, retry.requestId);
  assert.deepEqual(recovered, { data: [{ id: "fresh" }], requestId: 2, status: "ready" });
  assert.deepEqual(failedRetry, { data: [{ id: "fresh" }], requestId: 3, status: "error" });
});

test("overlapping requests and a later retry cannot commit an older response", () => {
  const gate = createHomeFeedRequestGate();
  const initial = gate.begin();
  const resumedRetry = gate.begin();
  assert.equal(gate.isCurrent(initial), false);
  assert.equal(gate.isCurrent(resumedRetry), true);

  const latest = { data: [{ id: "fresh" }], requestId: resumedRetry, status: "ready" };
  assert.equal(resolveHomeFeedLoad(latest, initial, [{ id: "stale" }]), latest);
});

test("an older refresh completion cannot clear a newer retry's loading state", () => {
  const gate = createHomeFeedRequestGate();
  const firstRefresh = gate.begin();
  const retry = gate.begin();
  assert.equal(gate.isCurrent(firstRefresh), false);
  assert.equal(gate.isCurrent(retry), true);
});

test("feed request state never owns or changes a Create draft", () => {
  const draft = { title: "Keep this draft", description: "while retrying" };
  const loading = beginHomeFeedLoad({ data: [{ id: "cached" }], requestId: 8, status: "ready" });
  rejectHomeFeedLoad(loading, loading.requestId);
  assert.deepEqual(draft, { title: "Keep this draft", description: "while retrying" });
});

test("a stalled Home RPC becomes a retryable error instead of loading forever", async () => {
  await assert.rejects(
    withHomeFeedTimeout(new Promise(() => {}), 5),
    /Home feed request timed out/,
  );
});

test("a rejected Home RPC preserves its error for the loader to render", async () => {
  const rpcError = new Error("RPC unavailable");
  await assert.rejects(withHomeFeedTimeout(Promise.reject(rpcError), 50), rpcError);
});

test("native Home loader commits only current feed, count, and refresh work", () => {
  assert.match(appSource, /const homeFeedRequestGate = useRef\(createHomeFeedRequestGate\(\)\)\.current/);
  assert.match(appSource, /const refreshRequestGate = useRef\(createHomeFeedRequestGate\(\)\)\.current/);
  assert.match(appSource, /withHomeFeedTimeout\(client\.rpc\("list_home_quests"/);
  assert.match(appSource, /setHomeFeedLoadStatus\("ready"\);\s*if \(!append\) \{\s*optionalAnalytics\.capture\("discovery_loaded"[\s\S]*?\}\s*void loadQuestCardCounts/);
  assert.match(appSource, /if \(!canCommit\(\)\) return;\s*setCommentCountByQuestId/);
  assert.match(appSource, /if \(refreshRequestGate\.isCurrent\(requestId\)\) setRefreshing\(false\)/);
  assert.doesNotMatch(appSource, /async function refreshAll\(\) \{\s*if \(!supabase\) return;/);
});
