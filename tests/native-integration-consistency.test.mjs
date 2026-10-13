import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLatestScopedRequestGate } from "../apps/mobile/src/lib/scoped-mutation-gate.js";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
const emailChangeSource = readFileSync(new URL("../apps/mobile/src/lib/email-change-state.js", import.meta.url), "utf8");
const packageSource = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const iosInfoPlist = readFileSync(new URL("../apps/mobile/ios/QuestHat/Info.plist", import.meta.url), "utf8");

test("support email URL probing is declared to iOS", () => {
  assert.match(appSource, /Linking\.canOpenURL\(mailto\)/);
  assert.match(iosInfoPlist, /<key>LSApplicationQueriesSchemes<\/key>[\s\S]*?<string>mailto<\/string>/);
});

test("latest authenticated refresh rejects older retry and account scopes", () => {
  const gate = createLatestScopedRequestGate();
  const first = gate.begin("user-a");
  const second = gate.begin("user-a");
  assert.equal(gate.isCurrent(first, "user-a"), false);
  assert.equal(gate.isCurrent(second, "user-a"), true);
  assert.equal(gate.isCurrent(second, "user-b"), false);
  gate.invalidate();
  assert.equal(gate.isCurrent(second, "user-a"), false);

  assert.match(appSource, /const request = authedDataRequestGate\.begin\(uid\)/);
  assert.match(appSource, /authUser\.user\?\.id !== uid/);
  assert.match(appSource, /authedDataRequestGate\.invalidate\(\)/);
  assert.match(appSource, /setSelectedQuestExactAccessUserIds\(\[\]\)[\s\S]*setMessages\(\[\]\)[\s\S]*setNotifications\(\[\]\)/);
});

test("quest-scoped mutations and media callbacks cannot update a later account or quest", () => {
  assert.match(appSource, /membershipManagementActionGate\.isCurrent\([\s\S]*?selectedQuestRef\.current\?\.id/);
  assert.match(appSource, /locationShareActionGate\.isCurrent\([\s\S]*?selectedQuestRef\.current\?\.id/);
  assert.match(appSource, /coordinationReminderActionGate\.isCurrent\([\s\S]*?selectedQuestRef\.current\?\.id/);
  const accessFlow = appSource.match(/async function setQuestExactAddressAccess[\s\S]*?async function shareQuestAddressWithAllGuests/)?.[0] || "";
  assert.ok(accessFlow.indexOf("if (!actionIsCurrent()) return;") < accessFlow.indexOf("setSelectedQuestExactAccessUserIds"));
  assert.match(appSource, /const actionIsCurrent = \(\) => profilePhotoOperationGate\.isCurrent\(photoOperation, calendarUserRef\.current \|\| ""\)/);
  assert.match(appSource, /if \(calendarUserRef\.current !== operationUserId\) return;\s*if \(result\.canceled/);
});

test("calendar and auth callbacks stay account-scoped across every asynchronous boundary", () => {
  assert.match(appSource, /const actionKey = `calendar:\$\{operationUserId\}:\$\{quest\.id\}`/);
  assert.match(appSource, /calendarId = await getWritableCalendarId\(\);\s*if \(!actionIsCurrent\(\)\) return;\s*eventId = await Calendar\.createEventAsync/);
  assert.match(appSource, /await persistCalendarExportBaseline[\s\S]*?if \(!actionIsCurrent\(\)\) return/);
  assert.match(appSource, /let authObservation = 0/);
  assert.match(appSource, /initialObservation !== authObservation/);
  assert.match(appSource, /callback\.type !== "email_change"/);
  assert.match(emailChangeSource, /parsed\.protocol !== "questhat:" \|\| parsed\.hostname !== "auth" \|\| parsed\.pathname !== "\/callback"/);
});

test("all local mobile helper imports resolve and the repository test script includes integration tests", () => {
  const imports = [...appSource.matchAll(/from "(\.\/lib\/[^"\n]+)"/g)].map((match) => match[1]);
  for (const relative of imports) {
    const base = new URL(`../apps/mobile/src/${relative}`, import.meta.url);
    const basePath = fileURLToPath(base);
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`];
    assert.ok(candidates.some((candidate) => existsSync(candidate)), `missing local import ${relative}`);
  }
  assert.equal(packageSource.scripts.test, "node --test tests/*.test.mjs");
});
