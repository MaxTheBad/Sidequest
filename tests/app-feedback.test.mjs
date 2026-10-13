import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createFeedbackService, feedbackFingerprint, validateFeedback } from "../src/lib/app-feedback.js";

test("feedback validation blocks injection and retains only disclosed fields", () => {
  assert.throws(() => validateFeedback({ category: "bug", message: "x".repeat(20), replyContact: "a@b.com\nBcc:x@y.com" }), /valid reply email/);
  assert.equal(validateFeedback({ category: "bug", message: "x".repeat(20), diagnostics: false }).diagnostics, null);
});

test("server service fails closed, deduplicates durably, and releases failed deliveries", async () => {
  const deliveries = []; const states = new Map(); let counter = 0;
  const reserve = async (fingerprint) => {
    if (states.get(fingerprint) === "delivered") return { accepted: false, reason: "duplicate" };
    const reservationId = `r${++counter}`; states.set(fingerprint, { reservationId });
    return { accepted: true, reservationId };
  };
  const finalize = async (reservationId, delivered) => {
    const entry = [...states.entries()].find(([, value]) => value?.reservationId === reservationId);
    if (!entry) throw new Error("missing reservation");
    if (delivered) states.set(entry[0], "delivered"); else states.delete(entry[0]);
  };
  const service = createFeedbackService({ reserve, finalize, deliver: async (item) => deliveries.push(item) });
  assert.equal((await service.submit({ actorId: "", input: { category: "bug", message: "x".repeat(20) } })).status, 401);
  assert.equal((await service.submit({ actorId: "u", input: { category: "bug", message: "x".repeat(20) } })).ok, true);
  assert.equal((await service.submit({ actorId: "u", input: { category: "bug", message: "x".repeat(20) } })).status, 409);
  const failed = createFeedbackService({ reserve, finalize, deliver: async () => { throw new Error("smtp"); } });
  assert.equal((await failed.submit({ actorId: "u", input: { category: "bug", message: "y".repeat(20) } })).status, 502);
  assert.equal((await failed.submit({ actorId: "u", input: { category: "bug", message: "y".repeat(20) } })).status, 502, "failed SMTP reservations remain retryable");
  assert.equal((await createFeedbackService({ deliver: async () => {} }).submit({ actorId: "u", input: { category: "bug", message: "z".repeat(20) } })).status, 503);
  const limited = createFeedbackService({ reserve: async () => ({ accepted: false, reason: "rate_limited" }), finalize, deliver: async () => {} });
  assert.equal((await limited.submit({ actorId: "u", input: { category: "bug", message: "r".repeat(20) } })).status, 429);
  assert.equal(deliveries.length, 1);
});

test("settings feedback is separate from reports and accessible", () => {
  const source = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/app-feedback/route.ts", import.meta.url), "utf8");
  assert.match(source, /Suggest or report a problem/); assert.match(source, /role="dialog"/); assert.match(source, /aria-label="Close feedback form"/);
  assert.match(source, /not reports about people or content/); assert.match(route, /const recipient = "suggestions@questhat\.com"/); assert.doesNotMatch(route, /body\.to|body\.recipient/);
});

test("native feedback is wired, default-off, and fails clearly when a challenge is required", () => {
  const native = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
  assert.match(native, /NATIVE_FEEDBACK_ENABLED/); assert.match(native, /Suggest or report a problem/); assert.match(native, /native build cannot complete it yet/);
  assert.match(native, /authorization: `Bearer \$\{data\.session\.access_token\}`/);
});

test("durable feedback reservation is atomic and survives serverless restarts", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261011130000_feedback_intake_rate_limits.sql", import.meta.url), "utf8");
  assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /primary key \(user_id, fingerprint\)/); assert.match(sql, /interval '24 hours'/); assert.match(sql, /interval '10 minutes'/); assert.match(sql, /captcha_required/);
  assert.match(sql, /finalize_app_feedback_intake_server/); assert.match(sql, /delivery_state = 'reserved'/); assert.match(sql, /rate_limited/);
  assert.match(sql, /request\.jwt\.claims/); assert.match(sql, /role'\), ''\) <> 'service_role'/);
  assert.match(sql, /revoke all on function public\.reserve_app_feedback_intake_server\([^)]+\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.reserve_app_feedback_intake_server\([^)]+\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.reserve_app_feedback_intake_server\([^)]+\) to authenticated/);
  const route = readFileSync(new URL("../src/app/api/app-feedback/route.ts", import.meta.url), "utf8");
  assert.match(route, /Authorization: `Bearer \$\{token\}`/); assert.match(route, /reserve_app_feedback_intake_server/); assert.match(route, /finalize_app_feedback_intake_server/);
  assert.match(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/); assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /p_user_id: data\.user\.id/); assert.match(route, /p_captcha_verified: verifiedCaptcha/);
});

test("feedback deduplication is scoped to the authenticated actor rather than sharing one user's submission state", async () => {
  const input = { category: "bug", message: "x".repeat(20) };
  const first = await feedbackFingerprint("account-a", validateFeedback(input));
  const second = await feedbackFingerprint("account-b", validateFeedback(input));
  assert.notEqual(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(second, /^[a-f0-9]{64}$/);
});
