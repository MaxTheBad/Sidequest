-- Dedicated staff authorization, MFA enforcement, and assignment audit trail.

create table if not exists public.staff_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('moderator', 'senior_moderator', 'admin', 'super_admin')),
  active boolean not null default true,
  appointed_by uuid null references public.profiles(id) on delete set null,
  appointed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid null references public.profiles(id) on delete set null,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('appointed', 'role_changed', 'activated', 'deactivated')),
  previous_role text null,
  new_role text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists staff_members_active_role_idx on public.staff_members (active, role);
create index if not exists staff_audit_events_target_idx on public.staff_audit_events (target_user_id, created_at desc);

-- Preserve any staff assignments made before this migration.
insert into public.staff_members (user_id, role, active, appointed_by)
select
  p.id,
  case when p.role = 'moderator' then 'moderator'
       when p.role = 'super_admin' then 'super_admin'
       else 'admin' end,
  true,
  null
from public.profiles p
where p.role in ('moderator', 'admin', 'super_admin')
on conflict (user_id) do nothing;

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sm.role from public.staff_members sm where sm.user_id = auth.uid() and sm.active),
    'user'
  );
$$;

create or replace function public.staff_mfa_verified()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Existing RLS policies call this helper, so make the protected staff table the
-- source of truth without requiring every historical policy to be rewritten.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_staff_role()
    when 'senior_moderator' then 'admin'
    else public.current_staff_role()
  end;
$$;

revoke all on function public.current_staff_role() from public, anon;
revoke all on function public.staff_mfa_verified() from public, anon;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.staff_mfa_verified() to authenticated;

alter table public.staff_members enable row level security;
alter table public.staff_audit_events enable row level security;

drop policy if exists staff_members_select_admins on public.staff_members;
create policy staff_members_select_admins
on public.staff_members for select to authenticated
using (
  user_id = auth.uid()
  or (
    public.current_staff_role() in ('admin', 'super_admin')
    and public.staff_mfa_verified()
  )
);

drop policy if exists staff_audit_events_select_admins on public.staff_audit_events;
create policy staff_audit_events_select_admins
on public.staff_audit_events for select to authenticated
using (
  public.current_staff_role() in ('admin', 'super_admin')
  and public.staff_mfa_verified()
);

-- No client insert/update/delete policies exist for staff tables. Assignment is
-- only possible through the checked security-definer function below.

create or replace function public.get_my_staff_access()
returns table (staff_role text, is_active boolean, mfa_verified boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sm.role, 'user'),
    coalesce(sm.active, false),
    public.staff_mfa_verified()
  from (select auth.uid() as user_id) session
  left join public.staff_members sm on sm.user_id = session.user_id;
$$;

revoke all on function public.get_my_staff_access() from public, anon;
grant execute on function public.get_my_staff_access() to authenticated;

create or replace function public.list_staff_members()
returns table (
  user_id uuid,
  role text,
  active boolean,
  appointed_at timestamptz,
  updated_at timestamptz,
  display_name text,
  username text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_staff_role() not in ('admin', 'super_admin') or not public.staff_mfa_verified() then
    raise exception using errcode = '42501', message = 'Admin access with MFA is required.';
  end if;

  return query
  select sm.user_id, sm.role, sm.active, sm.appointed_at, sm.updated_at,
         p.display_name, p.username, p.avatar_url
  from public.staff_members sm
  join public.profiles p on p.id = sm.user_id
  order by sm.active desc, sm.role desc, p.display_name nulls last;
end;
$$;

revoke all on function public.list_staff_members() from public, anon;
grant execute on function public.list_staff_members() to authenticated;

create or replace function public.set_staff_member(
  p_identifier text,
  p_role text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_staff_role();
  target_id uuid;
  previous public.staff_members%rowtype;
  event_action text;
begin
  if actor_role not in ('admin', 'super_admin') or not public.staff_mfa_verified() then
    raise exception using errcode = '42501', message = 'Admin access with MFA is required.';
  end if;
  if p_role not in ('moderator', 'senior_moderator', 'admin', 'super_admin') then
    raise exception using errcode = '22023', message = 'Invalid staff role.';
  end if;
  if p_role = 'super_admin' and actor_role <> 'super_admin' then
    raise exception using errcode = '42501', message = 'Only a super admin can assign that role.';
  end if;

  if p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_id := p_identifier::uuid;
  else
    select p.id into target_id from public.profiles p
    where lower(p.username) = lower(btrim(p_identifier))
    limit 1;
  end if;
  if target_id is null then
    raise exception using errcode = 'P0002', message = 'No profile found for that username or user ID.';
  end if;

  select * into previous from public.staff_members where user_id = target_id;
  if found and previous.role = 'super_admin' and actor_role <> 'super_admin' then
    raise exception using errcode = '42501', message = 'Only a super admin can change that account.';
  end if;
  if target_id = actor_id and previous.role = 'super_admin' and (not p_active or p_role <> 'super_admin') then
    raise exception using errcode = '22023', message = 'A super admin cannot revoke their own access.';
  end if;

  event_action := case
    when previous.user_id is null then 'appointed'
    when previous.active and not p_active then 'deactivated'
    when not previous.active and p_active then 'activated'
    else 'role_changed'
  end;

  insert into public.staff_members (user_id, role, active, appointed_by)
  values (target_id, p_role, p_active, actor_id)
  on conflict (user_id) do update
  set role = excluded.role,
      active = excluded.active,
      appointed_by = actor_id,
      updated_at = now();

  -- Compatibility display only. Authorization never trusts profiles.role.
  update public.profiles
  set role = case when p_active then case when p_role = 'senior_moderator' then 'admin' else p_role end else 'user' end,
      updated_at = now()
  where id = target_id;

  insert into public.staff_audit_events (actor_id, target_user_id, action, previous_role, new_role)
  values (actor_id, target_id, event_action, previous.role, case when p_active then p_role else null end);

  return target_id;
end;
$$;

revoke all on function public.set_staff_member(text, text, boolean) from public, anon;
grant execute on function public.set_staff_member(text, text, boolean) to authenticated;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_staff_role();
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and (actor_role not in ('admin', 'super_admin') or not public.staff_mfa_verified()) then
      raise exception using errcode = '42501', message = 'Staff roles cannot be changed from a profile update.';
    end if;
  end if;

  if new.moderation_status is distinct from old.moderation_status then
    if auth.uid() is not null and (actor_role not in ('moderator', 'senior_moderator', 'admin', 'super_admin') or not public.staff_mfa_verified()) then
      raise exception using errcode = '42501', message = 'Account enforcement state cannot be changed from a profile update.';
    end if;
  end if;

  if old.moderation_status <> 'active' and new.deactivated_at is null then
    if auth.uid() is not null and (actor_role not in ('senior_moderator', 'admin', 'super_admin') or not public.staff_mfa_verified()) then
      raise exception using errcode = '42501', message = 'A moderated account cannot restore itself.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
before update of role, moderation_status, deactivated_at on public.profiles
for each row execute function public.protect_profile_security_fields();

-- Staff report access requires both an active assignment and an MFA-verified JWT.
drop policy if exists reports_select_moderators on public.reports;
create policy reports_select_moderators
on public.reports for select to authenticated
using (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
);

drop policy if exists reports_update_moderators on public.reports;
create policy reports_update_moderators
on public.reports for update to authenticated
using (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
)
with check (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
);

drop policy if exists report_actions_select_moderators on public.report_actions;
create policy report_actions_select_moderators
on public.report_actions for select to authenticated
using (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
);

drop policy if exists report_actions_insert_moderators on public.report_actions;
create policy report_actions_insert_moderators
on public.report_actions for insert to authenticated
with check (
  actor_id = auth.uid()
  and public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
);

drop policy if exists moderation_email_queue_select_moderators on public.moderation_email_queue;
create policy moderation_email_queue_select_moderators
on public.moderation_email_queue for select to authenticated
using (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
);

drop policy if exists moderation_email_queue_update_moderators on public.moderation_email_queue;
create policy moderation_email_queue_update_moderators
on public.moderation_email_queue for update to authenticated
using (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
)
with check (
  public.current_staff_role() in ('moderator', 'senior_moderator', 'admin', 'super_admin')
  and public.staff_mfa_verified()
);

create or replace function public.apply_moderation_enforcement(
  p_report_id uuid,
  p_status text,
  p_action_type text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moderator_id uuid := auth.uid();
  staff_role text := public.current_staff_role();
  target_report public.reports%rowtype;
begin
  if moderator_id is null
     or staff_role not in ('moderator', 'senior_moderator', 'admin', 'super_admin')
     or not public.staff_mfa_verified() then
    raise exception using errcode = '42501', message = 'Active moderator access with MFA is required.';
  end if;
  if p_action_type = 'ban' and staff_role not in ('senior_moderator', 'admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'A senior moderator or admin must approve permanent bans.';
  end if;
  if p_status not in ('open', 'triaged', 'reviewing', 'resolved', 'dismissed', 'escalated') then
    raise exception using errcode = '22023', message = 'Invalid report status.';
  end if;
  if p_action_type not in ('warn', 'mute', 'suspend', 'ban', 'dismiss', 'request_more_info') then
    raise exception using errcode = '22023', message = 'Invalid moderation action.';
  end if;

  select * into target_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found.';
  end if;

  insert into public.report_actions (report_id, actor_id, action_type, note)
  values (p_report_id, moderator_id, p_action_type, nullif(btrim(p_note), ''));

  update public.reports
  set status = p_status, reviewed_by = moderator_id, reviewed_at = now(),
      resolution_note = nullif(btrim(p_note), ''), admin_assignee_id = moderator_id
  where id = p_report_id;

  if p_action_type in ('suspend', 'ban') and target_report.reported_user_id is not null then
    update public.profiles
    set moderation_status = case when p_action_type = 'ban' then 'banned' else 'suspended' end,
        deactivated_at = coalesce(deactivated_at, now()), updated_at = now()
    where id = target_report.reported_user_id;
    update public.push_tokens set active = false, updated_at = now()
    where user_id = target_report.reported_user_id;
  end if;

  if p_action_type in ('suspend', 'ban') and target_report.message_id is not null then
    delete from public.messages where id = target_report.message_id;
  end if;
  if p_action_type in ('suspend', 'ban') and target_report.quest_id is not null then
    delete from public.quests where id = target_report.quest_id;
  end if;
  return true;
end;
$$;

revoke all on function public.apply_moderation_enforcement(uuid, text, text, text) from public, anon;
grant execute on function public.apply_moderation_enforcement(uuid, text, text, text) to authenticated;
