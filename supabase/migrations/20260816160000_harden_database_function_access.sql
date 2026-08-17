-- Lock server/trigger functions out of the public REST RPC surface. Postgres
-- does not require callers to have EXECUTE on a trigger function for its
-- trigger to run, so these revocations do not interrupt normal writes.
do $$
declare
  target record;
begin
  for target in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', target.signature);
    execute format('grant execute on function %s to service_role', target.signature);
  end loop;
end
$$;

-- Helpers used by authenticated RLS policies.
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.can_upload_quest_media(text, text, jsonb) to authenticated;

-- The signed-out discovery policies currently use this helper too. It only
-- returns the caller's own role (NULL for anon) and exposes no account data.
grant execute on function public.current_profile_role() to anon;

-- Client-facing RPCs. Each function performs its own auth.uid()/role checks.
grant execute on function public.accept_current_eula(text) to authenticated;
grant execute on function public.apply_moderation_enforcement(uuid, text, text, text) to authenticated;
grant execute on function public.deactivate_live_activity_push_token(text) to authenticated;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.get_my_staff_access() to authenticated;
grant execute on function public.list_staff_members() to authenticated;
grant execute on function public.manage_quest_membership(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.reactivate_my_account() to authenticated;
grant execute on function public.register_live_activity_push_token(text, text) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.set_host_coordination_reminders(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.set_staff_member(text, text, boolean) to authenticated;

-- Fix mutable search paths on the remaining invoker/trigger functions flagged
-- by the database security advisor.
alter function public.touch_report_metadata() set search_path = public, pg_temp;
alter function public.queue_moderation_email() set search_path = public, pg_temp;
alter function public.quest_media_items_are_valid(jsonb) set search_path = public, pg_temp;

-- This aggregate contains moderation workflow metadata. Keep it server-only
-- and ensure any future access respects the caller's underlying RLS.
alter view public.moderation_email_queue_status set (security_invoker = true);
revoke all on public.moderation_email_queue_status from public, anon, authenticated;
grant select on public.moderation_email_queue_status to service_role;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless overridden.
alter default privileges in schema public revoke execute on functions from public;
