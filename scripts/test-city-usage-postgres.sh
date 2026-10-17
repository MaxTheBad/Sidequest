#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db_name="questhat_city_usage_test_$$"
created_roles=()
cleanup() {
  dropdb --if-exists "$db_name" >/dev/null 2>&1 || true
  for role in "${created_roles[@]-}"; do
    [[ -n "$role" ]] || continue
    psql postgres -qAtc "drop role if exists \"$role\"" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT
for role in anon authenticated service_role; do
  if [[ "$(psql postgres -qAtc "select count(*) from pg_roles where rolname='$role'")" == 0 ]]; then
    psql postgres -v ON_ERROR_STOP=1 -qAtc "create role \"$role\" nologin"
    created_roles+=("$role")
  fi
done
createdb "$db_name"
psql "$db_name" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema auth;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,deactivated_at timestamptz);
create table public.staff_members(user_id uuid primary key,role text,active boolean);
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
create function public.current_staff_role() returns text language sql stable security definer set search_path=public as $$select coalesce((select role from public.staff_members where user_id=auth.uid() and active),'user')$$;
create function public.staff_mfa_verified() returns boolean language sql stable as $$select coalesce(auth.jwt()->>'aal','aal1')='aal2'$$;
grant usage on schema auth to authenticated;
create schema cron;
create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
SQL
psql "$db_name" -v ON_ERROR_STOP=1 -q -f "$repo_dir/supabase/migrations/20261017193514_consented_city_usage_aggregates.sql"
psql "$db_name" -v ON_ERROR_STOP=1 -q -f "$repo_dir/supabase/tests/city_usage_aggregates.sql"
echo "PASS: disposable city-usage PostgreSQL privacy/consent/suppression/retention suite"
