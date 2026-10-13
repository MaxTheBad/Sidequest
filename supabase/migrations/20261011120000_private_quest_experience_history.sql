-- Local preparation only. This is a private factual history, not scoring,
-- ranking, warnings, enforcement, or an automatic no-show system.
create table if not exists public.quest_experience_records (
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz null,
  approved_at timestamptz null,
  hosted_at timestamptz null,
  confirmed_attended_at timestamptz null,
  left_at timestamptz null,
  cancelled_at timestamptz null,
  scheduled_start_snapshot timestamptz null,
  attendance_state text not null default 'unknown' check (attendance_state in ('unknown', 'confirmed', 'disputed')),
  updated_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);

alter table public.quest_experience_records enable row level security;
revoke all on public.quest_experience_records from public, anon, authenticated;

create or replace function public.record_quest_member_experience()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare quest_start timestamptz;
begin
  select starts_at into quest_start from public.quests where id = new.quest_id;
  insert into public.quest_experience_records (quest_id, user_id, requested_at, approved_at, scheduled_start_snapshot)
  values (new.quest_id, new.user_id,
    case when new.status = 'pending' then now() else null end,
    case when new.status = 'approved' then now() else null end,
    quest_start)
  on conflict (quest_id, user_id) do update set
    requested_at = coalesce(quest_experience_records.requested_at, case when new.status = 'pending' then now() else null end),
    approved_at = coalesce(quest_experience_records.approved_at, case when new.status = 'approved' then now() else null end),
    scheduled_start_snapshot = case when quest_experience_records.left_at is null then excluded.scheduled_start_snapshot else quest_experience_records.scheduled_start_snapshot end,
    updated_at = now();
  return new;
end; $$;

create or replace function public.record_quest_member_left_experience()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare quest_start timestamptz;
begin
  select starts_at into quest_start from public.quests where id = old.quest_id;
  insert into public.quest_experience_records (quest_id, user_id, left_at, scheduled_start_snapshot)
  values (old.quest_id, old.user_id, now(), quest_start)
  on conflict (quest_id, user_id) do update set left_at = now(), scheduled_start_snapshot = coalesce(quest_experience_records.scheduled_start_snapshot, excluded.scheduled_start_snapshot), updated_at = now();
  return old;
end; $$;

create or replace function public.record_quest_host_experience()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.quest_experience_records (quest_id, user_id, hosted_at, scheduled_start_snapshot)
  values (new.id, new.creator_id, now(), new.starts_at)
  on conflict (quest_id, user_id) do nothing;
  return new;
end; $$;

create or replace function public.record_quest_lifecycle_experience()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.quest_experience_records
  set scheduled_start_snapshot = case when left_at is null then new.starts_at else scheduled_start_snapshot end,
      cancelled_at = case when lower(coalesce(new.status, 'open')) in ('cancelled', 'canceled') then coalesce(cancelled_at, now()) else cancelled_at end,
      attendance_state = case when new.starts_at is distinct from old.starts_at or lower(coalesce(new.status, 'open')) in ('cancelled', 'canceled') then 'unknown' else attendance_state end,
      confirmed_attended_at = case when new.starts_at is distinct from old.starts_at or lower(coalesce(new.status, 'open')) in ('cancelled', 'canceled') then null else confirmed_attended_at end,
      updated_at = now()
  where quest_id = new.id;
  return new;
end; $$;

create or replace function public.record_quest_followup_experience()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.quest_experience_records (quest_id, user_id, attendance_state)
  values (new.quest_id, new.user_id, 'unknown')
  on conflict (quest_id, user_id) do update set
    attendance_state = case
      when new.went is not null and new.host_attendance is not null and new.went is distinct from new.host_attendance then 'disputed'
      when new.host_attendance is true and new.went is not false then 'confirmed'
      else 'unknown'
    end,
    confirmed_attended_at = case when new.host_attendance is true and new.went is not false then coalesce(quest_experience_records.confirmed_attended_at, now()) else null end,
    updated_at = now();
  return new;
end; $$;

drop trigger if exists quest_experience_member_change on public.quest_members;
create trigger quest_experience_member_change after insert or update of status on public.quest_members for each row execute function public.record_quest_member_experience();
drop trigger if exists quest_experience_member_left on public.quest_members;
create trigger quest_experience_member_left before delete on public.quest_members for each row execute function public.record_quest_member_left_experience();
drop trigger if exists quest_experience_host_created on public.quests;
create trigger quest_experience_host_created after insert on public.quests for each row execute function public.record_quest_host_experience();
drop trigger if exists quest_experience_lifecycle_changed on public.quests;
create trigger quest_experience_lifecycle_changed after update of starts_at, ends_at, completed_at, status on public.quests for each row execute function public.record_quest_lifecycle_experience();
drop trigger if exists quest_experience_followup_changed on public.quest_followups;
create trigger quest_experience_followup_changed after insert or update of went, host_attendance on public.quest_followups for each row execute function public.record_quest_followup_experience();

create or replace function public.my_quest_experience_history()
returns setof public.quest_experience_records
language sql security definer set search_path = public, pg_temp as $$
  select * from public.quest_experience_records where user_id = auth.uid() order by updated_at desc;
$$;
revoke all on function public.my_quest_experience_history() from public, anon, authenticated;
grant execute on function public.my_quest_experience_history() to authenticated;
revoke all on function public.record_quest_member_experience() from public, anon, authenticated;
revoke all on function public.record_quest_member_left_experience() from public, anon, authenticated;
revoke all on function public.record_quest_host_experience() from public, anon, authenticated;
revoke all on function public.record_quest_lifecycle_experience() from public, anon, authenticated;
revoke all on function public.record_quest_followup_experience() from public, anon, authenticated;

comment on table public.quest_experience_records is 'Private factual history. Retain only while account/quest records are retained; delete via account deletion cascade or approved data-deletion workflow. No scores, penalties, warnings, or public display.';
