-- Security/audit retention v1
-- Run after sql/security-audit-v1.sql.
--
-- Policy:
-- - raw IP addresses are nulled after 90 days
-- - low-risk events are deleted after 365 days
-- - high-value audit records remain, with hashed IP and metadata, for moderation history

do $$
begin
  create extension if not exists pg_cron;
exception
  when insufficient_privilege or feature_not_supported or undefined_file then
    raise notice 'pg_cron extension could not be enabled automatically. The cleanup function will still be created.';
end $$;

create or replace function public.cleanup_security_audit_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.security_events
  set raw_ip = null
  where raw_ip is not null
    and created_at < now() - interval '90 days';

  update public.media_assets
  set raw_ip = null
  where raw_ip is not null
    and created_at < now() - interval '90 days';

  delete from public.security_events
  where created_at < now() - interval '365 days'
    and event_type in (
      'oauth_started',
      'login_password_success',
      'turnstile_verified'
    );
end;
$$;

revoke all on function public.cleanup_security_audit_logs() from public;
grant execute on function public.cleanup_security_audit_logs() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'questhat-security-audit-retention') then
      perform cron.unschedule('questhat-security-audit-retention');
    end if;
    perform cron.schedule(
      'questhat-security-audit-retention',
      '17 4 * * *',
      'select public.cleanup_security_audit_logs();'
    );
  end if;
exception
  when undefined_function or insufficient_privilege then
    raise notice 'pg_cron is unavailable or not permitted. Run select public.cleanup_security_audit_logs(); manually or schedule it from Supabase.';
end $$;
