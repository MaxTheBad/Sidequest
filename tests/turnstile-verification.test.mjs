import assert from "node:assert/strict";
import test from "node:test";
import { verifyTurnstileToken } from "../src/lib/turnstile-verification.js";

test("Turnstile verification fails closed for missing, expired, and failed challenges", async () => {
  assert.equal(await verifyTurnstileToken({ token: "", secret: "secret", fetchImpl: async () => { throw new Error("must not run"); } }), false);
  assert.equal(await verifyTurnstileToken({ token: "token", secret: "", fetchImpl: async () => { throw new Error("must not run"); } }), false);
  assert.equal(await verifyTurnstileToken({ token: "expired", secret: "secret", fetchImpl: async () => ({ ok: true, json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) }) }), false);
  assert.equal(await verifyTurnstileToken({ token: "failed", secret: "secret", fetchImpl: async () => ({ ok: false, json: async () => ({ success: true }) }) }), false);
  assert.equal(await verifyTurnstileToken({ token: "network", secret: "secret", fetchImpl: async () => { throw new Error("offline"); } }), false);
});

test("Turnstile token success is server-derived and replay fails", async () => {
  const used = new Set();
  const fetchImpl = async (_url, options) => {
    const token = options.body.get("response");
    if (used.has(token)) return { ok: true, json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) };
    used.add(token);
    return { ok: true, json: async () => ({ success: true }) };
  };
  assert.equal(await verifyTurnstileToken({ token: "single-use", secret: "server-secret", fetchImpl }), true);
  assert.equal(await verifyTurnstileToken({ token: "single-use", secret: "server-secret", fetchImpl }), false);
});
