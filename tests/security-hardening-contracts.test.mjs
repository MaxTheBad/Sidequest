import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const abuseMigration = readFileSync(new URL("../supabase/migrations/20260731143000_abuse_rate_limits_and_media_caps.sql", import.meta.url), "utf8");
const invitationMigration = readFileSync(new URL("../supabase/migrations/20260930090000_harden_quest_invitations.sql", import.meta.url), "utf8");
const moderationClient = readFileSync(new URL("../apps/mobile/src/lib/moderation-client-state.js", import.meta.url), "utf8");

test("message, quest, and report limits serialize per actor and reject repeated submissions", () => {
  assert.match(abuseMigration, /pg_advisory_xact_lock\(hashtextextended\('message:' \|\| new\.sender_id::text/);
  assert.match(abuseMigration, /existing\.sender_id = new\.sender_id[\s\S]*existing\.quest_id = new\.quest_id/);
  assert.match(abuseMigration, /recent_count >= 8/);
  assert.match(abuseMigration, /pg_advisory_xact_lock\(hashtextextended\('quest:' \|\| new\.creator_id::text/);
  assert.match(abuseMigration, /created_at >= now\(\) - interval '5 minutes'/);
  assert.match(abuseMigration, /pg_advisory_xact_lock\(hashtextextended\('report:' \|\| new\.reporter_id::text/);
  assert.match(abuseMigration, /You already reported this content/);
});

test("media writes are owned by the authenticated path and bounded server-side", () => {
  assert.match(abuseMigration, /actor_id text := auth\.uid\(\)::text/);
  assert.match(abuseMigration, /split_part\(object_name, '\/', 1\) <> actor_id/);
  assert.match(abuseMigration, /object_size <= 0 or object_size > 62914560/);
  assert.match(abuseMigration, /recent_count >= 12/);
  assert.match(abuseMigration, /auth\.uid\(\)::text = split_part\(name, '\/', 1\)/);
});

test("quest invitations remain host-only, recipient-scoped, and duplicate-safe", () => {
  assert.match(invitationMigration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(invitationMigration, /q\.creator_id = caller_id/);
  assert.match(invitationMigration, /caller_id = p_recipient_id/);
  assert.match(invitationMigration, /char_length\(coalesce\(p_message, ''\)\) > 500/);
  assert.match(invitationMigration, /This person has already joined the quest/);
});

test("client moderation gates retain one-shot report and block controls", () => {
  assert.match(moderationClient, /createModerationActionGate/);
  assert.match(moderationClient, /confirmedBlockMutationError/);
});
