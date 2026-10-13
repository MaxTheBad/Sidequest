#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db_name="questhat_feedback_test_$$"
created_roles=()

cleanup() {
  dropdb --if-exists "$db_name" >/dev/null 2>&1 || true
  for role in "${created_roles[@]-}"; do
    [[ -n "$role" ]] || continue
    psql postgres -v ON_ERROR_STOP=1 -qAtc "drop role if exists \"$role\"" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

for role in anon authenticated service_role; do
  if [[ "$(psql postgres -qAtc "select count(*) from pg_roles where rolname = '$role'")" == "0" ]]; then
    psql postgres -v ON_ERROR_STOP=1 -qAtc "create role \"$role\" nologin"
    created_roles+=("$role")
  fi
done

createdb "$db_name"
psql "$db_name" -v ON_ERROR_STOP=1 -q <<'SQL'
create table public.profiles(id uuid primary key);
grant usage on schema public to anon, authenticated, service_role;
SQL
psql "$db_name" -v ON_ERROR_STOP=1 -f "$repo_dir/supabase/migrations/20261011130000_feedback_intake_rate_limits.sql"
psql "$db_name" -v ON_ERROR_STOP=1 -f "$repo_dir/supabase/tests/feedback_intake_rate_limits.sql"
