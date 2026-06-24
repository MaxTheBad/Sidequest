-- Moderation/admin stack v1
-- Extends the reports system with privileged roles, richer status handling,
-- and an email outbox that a backend worker or Supabase Edge Function can drain.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'moderator', 'admin', 'super_admin'));

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'user'
  );
$$;

alter table public.reports
  add column if not exists updated_at timestamptz not null default now();

alter table public.reports
  add column if not exists status_changed_at timestamptz not null default now();

alter table public.reports
  add column if not exists admin_assignee_id uuid null references public.profiles(id) on delete set null;

alter table public.reports
  drop constraint if exists reports_status_check;

alter table public.reports
  add constraint reports_status_check
  check (status in ('open', 'triaged', 'reviewing', 'resolved', 'dismissed', 'escalated'));

create index if not exists reports_admin_assignee_idx on public.reports (admin_assignee_id, status, created_at desc);

create or replace function public.touch_report_metadata()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists reports_touch_report_metadata on public.reports;
create trigger reports_touch_report_metadata
before update on public.reports
for each row execute function public.touch_report_metadata();

create table if not exists public.moderation_email_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report_id uuid not null references public.reports(id) on delete cascade,
  queue_reason text not null check (queue_reason in ('new_report', 'high_report', 'critical_report', 'escalated_report')),
  attempts int not null default 0,
  sent_at timestamptz null,
  last_error text null,
  provider_message_id text null
);

create unique index if not exists moderation_email_queue_report_reason_idx
  on public.moderation_email_queue (report_id, queue_reason);

alter table public.moderation_email_queue
  drop constraint if exists moderation_email_queue_queue_reason_check;

alter table public.moderation_email_queue
  add constraint moderation_email_queue_queue_reason_check
  check (queue_reason in ('new_report', 'high_report', 'critical_report', 'escalated_report'));

alter table public.moderation_email_queue enable row level security;

drop policy if exists moderation_email_queue_select_moderators on public.moderation_email_queue;
create policy moderation_email_queue_select_moderators
on public.moderation_email_queue for select
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

drop policy if exists moderation_email_queue_update_moderators on public.moderation_email_queue;
create policy moderation_email_queue_update_moderators
on public.moderation_email_queue for update
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'))
with check (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

create or replace function public.queue_moderation_email()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.moderation_email_queue (report_id, queue_reason)
    values (
      new.id,
      case
        when new.severity = 'critical' then 'critical_report'
        when new.severity = 'high' then 'high_report'
        else 'new_report'
      end
    )
    on conflict do nothing;
  elsif tg_op = 'UPDATE' then
    if new.status = 'escalated' and old.status is distinct from new.status then
      insert into public.moderation_email_queue (report_id, queue_reason)
      values (new.id, 'escalated_report')
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_queue_moderation_email_on_insert on public.reports;
create trigger reports_queue_moderation_email_on_insert
after insert on public.reports
for each row execute function public.queue_moderation_email();

drop trigger if exists reports_queue_moderation_email_on_update on public.reports;
create trigger reports_queue_moderation_email_on_update
after update on public.reports
for each row execute function public.queue_moderation_email();

drop policy if exists reports_select_moderators on public.reports;
create policy reports_select_moderators
on public.reports for select
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

drop policy if exists reports_update_moderators on public.reports;
create policy reports_update_moderators
on public.reports for update
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'))
with check (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

drop policy if exists report_actions_select_moderators on public.report_actions;
create policy report_actions_select_moderators
on public.report_actions for select
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

drop policy if exists report_actions_insert_moderators on public.report_actions;
create policy report_actions_insert_moderators
on public.report_actions for insert
to authenticated
with check (
  actor_id = auth.uid()
  and public.current_profile_role() in ('moderator', 'admin', 'super_admin')
);

-- Optional helper view for moderation dashboards or cron jobs.
create or replace view public.moderation_email_queue_status as
select
  count(*) filter (where sent_at is null) as pending_count,
  count(*) filter (where sent_at is not null) as sent_count,
  max(created_at) as last_queued_at,
  max(sent_at) as last_sent_at
from public.moderation_email_queue;
