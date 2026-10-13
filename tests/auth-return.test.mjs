import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_RETURN_STORAGE_KEY, consumeAuthReturn, getSafeAuthReturnPath, listingJoinAuthPath, storeAuthReturn } from "../src/lib/auth-return.ts";

const questId = "d8c6b957-d52b-446a-9e05-5b11ac1c84ce";

test("listing join auth return preserves the listing intent without joining", () => {
  assert.equal(listingJoinAuthPath(questId), `/?auth=1&returnTo=%2Flisting%2F${questId}%3Fjoin%3D1`);
  assert.equal(getSafeAuthReturnPath(`/listing/${questId}?join=1`), `/listing/${questId}?join=1`);
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

test("auth return survives cancellation, consumes once after sign-in, and clears hostile storage", () => {
  const storage = memoryStorage();
  const destination = `/listing/${questId}?join=1`;
  assert.equal(storeAuthReturn(storage, destination), true);
  assert.equal(storage.getItem(AUTH_RETURN_STORAGE_KEY), destination, "cancelling auth does not discard the pending local intent");
  assert.equal(consumeAuthReturn(storage), destination);
  assert.equal(consumeAuthReturn(storage), null, "a later retry cannot replay the previous join intent");

  storage.setItem(AUTH_RETURN_STORAGE_KEY, "https://attacker.example");
  assert.equal(consumeAuthReturn(storage), null);
  assert.equal(storage.getItem(AUTH_RETURN_STORAGE_KEY), null, "unsafe stored values are removed instead of retried");
  assert.equal(storeAuthReturn(storage, "//attacker.example"), false);
  assert.equal(storage.getItem(AUTH_RETURN_STORAGE_KEY), null);
});
