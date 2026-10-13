import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");

test("incoming listing links open public detail without requiring an authenticated session", () => {
  const effect = appSource.slice(
    appSource.indexOf("useEffect(() => {\n    if (!pendingDeepLinkQuestId) return;"),
    appSource.indexOf("  useEffect(() => {\n    if (signedIn)", appSource.indexOf("const openQuestDetailEvent")),
  );
  assert.match(effect, /void openQuestDetailEvent\(questId\)/);
  assert.doesNotMatch(effect, /!signedIn|!userId/);
});
