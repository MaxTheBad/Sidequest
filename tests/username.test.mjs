import assert from "node:assert/strict";
import test from "node:test";

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

test("username format accepts supported values", () => {
  assert.equal(USERNAME_PATTERN.test("alex_123"), true);
  assert.equal(USERNAME_PATTERN.test("abc"), true);
});

test("username format rejects unsupported values", () => {
  assert.equal(USERNAME_PATTERN.test("ab"), false);
  assert.equal(USERNAME_PATTERN.test("Alex"), false);
  assert.equal(USERNAME_PATTERN.test("alex-name"), false);
  assert.equal(USERNAME_PATTERN.test("a".repeat(31)), false);
});
