import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_RETURN_STORAGE_KEY, cancelAuthReturn, consumeAuthReturn, getSafeAuthReturnPath, listingJoinAuthPath, storeAuthReturn } from "../src/lib/auth-return.ts";
import { readFileSync } from "node:fs";

const questId = "d8c6b957-d52b-446a-9e05-5b11ac1c84ce";

test("listing join auth return preserves the listing intent without joining", () => {
  assert.equal(listingJoinAuthPath(questId), `/?auth=1&returnTo=%2Flisting%2F${questId}%3Fjoin%3D1`);
  assert.equal(getSafeAuthReturnPath(`/listing/${questId}?join=1`), `/listing/${questId}?join=1`);
});

test("public listing and home Join both preserve intent; return only focuses Join", () => {
  const listing = readFileSync(new URL("../src/app/listing/[id]/listing-client.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(listing, /if \(!userId\) return router\.push\(listingJoinAuthPath\(listing\.id\)\)/);
  assert.match(home, /storeAuthReturn\(window\.sessionStorage, `\/listing\/\$\{id\}\?join=1`\)/);
  assert.match(home, /if \(returnTo && activeUserId\)/);
  const returnEffect = listing.slice(listing.indexOf('new URLSearchParams(window.location.search)'), listing.indexOf("async function checkInToQuest"));
  assert.match(returnEffect, /router\.replace\(`/);
  assert.match(returnEffect, /joinButtonRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(returnEffect, /toggleJoin\(|\.insert\(|\.upsert\(/);
  assert.match(listing, /listing\.id !== listingId/);
});

test("new join intent replaces an earlier intent and unavailable storage fails safely", () => {
  const storage = memoryStorage();
  storeAuthReturn(storage, `/listing/${questId}?join=1`);
  const other = "8f157260-5028-4b08-9080-d4ba9b0bf910";
  storeAuthReturn(storage, `/listing/${other}?join=1`);
  assert.equal(consumeAuthReturn(storage), `/listing/${other}?join=1`);
  assert.equal(consumeAuthReturn(storage), null);
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(storeAuthReturn(denied, `/listing/${questId}?join=1`), false);
  assert.equal(consumeAuthReturn(denied), null);
});

test("auth return rejects external, malformed, and mutation-like destinations", () => {
  for (const value of ["https://attacker.example", "//attacker.example", "/listing/not-an-id?join=1", `/listing/${questId}?join=2`, `/listing/${questId}?join=1&next=/x`]) {
    assert.equal(getSafeAuthReturnPath(value), null, value);
  }
  assert.equal(getSafeAuthReturnPath(`/listing/${questId}`), `/listing/${questId}`);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("auth return survives failed sign-in, consumes once after success, and clears hostile storage", () => {
  const storage = memoryStorage();
  const destination = `/listing/${questId}?join=1`;
  assert.equal(storeAuthReturn(storage, destination), true);
  assert.equal(storage.getItem(AUTH_RETURN_STORAGE_KEY), destination, "an unsuccessful sign-in does not discard the pending local intent");
  assert.equal(consumeAuthReturn(storage), destination);
  assert.equal(consumeAuthReturn(storage), null, "a later retry cannot replay the previous join intent");

  storage.setItem(AUTH_RETURN_STORAGE_KEY, "https://attacker.example");
  assert.equal(consumeAuthReturn(storage), null);
  assert.equal(storage.getItem(AUTH_RETURN_STORAGE_KEY), null, "unsafe stored values are removed instead of retried");
  assert.equal(storeAuthReturn(storage, "//attacker.example"), false);
  assert.equal(storage.getItem(AUTH_RETURN_STORAGE_KEY), null);
});

test("closing or escaping sign-in returns to browsing and cannot replay a cancelled join", () => {
  const storage = memoryStorage();
  storeAuthReturn(storage, `/listing/${questId}?join=1`);
  assert.equal(cancelAuthReturn(storage), `/listing/${questId}`);
  assert.equal(consumeAuthReturn(storage), null);
  const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const close = home.slice(home.indexOf("const closeAuthModal"), home.indexOf("const [showCreateModal"));
  assert.match(close, /cancelAuthReturn/);
  assert.match(close, /window\.location\.assign\(returnTo\)/);
  assert.match(home, /manageModalFocus\("\.auth-sign-in-dialog", closeAuthModal/);
});
