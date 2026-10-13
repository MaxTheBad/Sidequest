import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20261011120000_private_quest_experience_history.sql", import.meta.url), "utf8");

test("private history distinguishes requested, approved, hosted, left, cancelled, and confirmed attendance", () => {
  for (const field of ["requested_at", "approved_at", "hosted_at", "confirmed_attended_at", "left_at", "cancelled_at", "scheduled_start_snapshot"]) assert.match(sql, new RegExp(field));
  assert.match(sql, /attendance_state text not null default 'unknown'/);
  assert.match(sql, /'disputed'/);
});

test("experience history is private, account-scoped, and idempotent", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.quest_experience_records from public, anon, authenticated/);
  assert.match(sql, /where user_id = auth\.uid\(\)/);
  assert.match(sql, /on conflict \(quest_id, user_id\) do update/i);
});

test("cancellation and rescheduling erase stale attendance certainty without creating a penalty", () => {
  assert.match(sql, /new\.starts_at is distinct from old\.starts_at/);
  assert.match(sql, /attendance_state = case[\s\S]*'unknown'/);
  assert.match(sql, /confirmed_attended_at = case[\s\S]*null/);
  assert.doesNotMatch(sql, /score_|penalty_|public_rank|warning_/i);
});

test("leave records capture the scheduled start snapshot for future policy, without enforcing a rule", () => {
  assert.match(sql, /record_quest_member_left_experience/);
  assert.match(sql, /left_at, scheduled_start_snapshot/);
  assert.doesNotMatch(sql, /interval '12 hours'/);
});
