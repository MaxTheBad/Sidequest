-- Local preparation only. Apply after product/security approval; this migration
-- does not schedule prompts or create attendance penalties.
alter table public.quests add column if not exists ends_at timestamptz;
alter table public.quests add column if not exists completed_at timestamptz;
alter table public.quests drop constraint if exists quests_end_after_start;
alter table public.quests add constraint quests_end_after_start
  check (ends_at is null or starts_at is null or ends_at >= starts_at) not valid;

-- A reschedule or cancellation invalidates a prior completion marker. This is
-- essential because eligibility must never survive a changed lifecycle.
create or replace function public.invalidate_quest_completion_on_lifecycle_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or lower(coalesce(new.status, 'open')) in ('cancelled', 'canceled') then
    new.completed_at := null;
  end if;
  return new;
end; $$;
drop trigger if exists quests_invalidate_completion_on_lifecycle_change on public.quests;
create trigger quests_invalidate_completion_on_lifecycle_change
before update of starts_at, ends_at, status on public.quests
for each row execute function public.invalidate_quest_completion_on_lifecycle_change();

create or replace function public.set_quest_lifecycle(
  p_quest_id uuid,
  p_ends_at timestamptz,
  p_mark_completed boolean default false
) returns public.quests
language plpgsql security definer set search_path = public, pg_temp as $$
declare caller_id uuid := auth.uid(); quest_row public.quests%rowtype; result public.quests%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;
  select * into quest_row from public.quests where id = p_quest_id for update;
  if quest_row.id is null or quest_row.creator_id <> caller_id then raise exception 'Only the host can update the quest lifecycle.'; end if;
  if lower(coalesce(quest_row.status, 'open')) in ('cancelled', 'canceled') then raise exception 'Cancelled quests cannot be completed.'; end if;
  if p_ends_at is null or (quest_row.starts_at is not null and p_ends_at < quest_row.starts_at) then raise exception 'End time must be at or after the start time.'; end if;
  if p_mark_completed and p_ends_at > now() then raise exception 'A future end time cannot be marked complete.'; end if;
  -- Let the lifecycle trigger invalidate any stale marker before setting a new
  -- completion marker. A single update of both columns would erase the marker.
  update public.quests set ends_at = p_ends_at where id = p_quest_id returning * into result;
  if p_mark_completed then
    update public.quests set completed_at = now() where id = p_quest_id returning * into result;
  end if;
  return result;
end; $$;

create table if not exists public.quest_followups (
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- NULL is an unanswered attendee response, never an inferred no-show.
  went boolean null,
  private_rating smallint null check (private_rating between 1 and 5),
  host_attendance boolean null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);

alter table public.quest_followups enable row level security;
revoke all on public.quest_followups from public, anon, authenticated;

create or replace function public.submit_quest_follow_up(
  p_quest_id uuid,
  p_went boolean,
  p_rating smallint default null
) returns public.quest_followups
language plpgsql security definer set search_path = public, pg_temp as $$
declare caller_id uuid := auth.uid(); quest_row public.quests%rowtype; result public.quest_followups%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;
  select * into quest_row from public.quests where id = p_quest_id;
  if quest_row.id is null then raise exception 'Quest not found.'; end if;
  if lower(coalesce(quest_row.status, 'open')) in ('cancelled', 'canceled') then raise exception 'Cancelled quests cannot receive follow-ups.'; end if;
  if quest_row.completed_at is null and (quest_row.ends_at is null or quest_row.ends_at > now()) then
    raise exception 'This quest has not ended yet.';
  end if;
  if not (quest_row.creator_id = caller_id or exists (select 1 from public.quest_members m where m.quest_id = p_quest_id and m.user_id = caller_id and m.status = 'approved')) then
    raise exception 'Only the host and approved attendees can submit follow-ups.';
  end if;
  insert into public.quest_followups (quest_id, user_id, went, private_rating)
  values (p_quest_id, caller_id, p_went, p_rating)
  on conflict (quest_id, user_id) do update set went = excluded.went, private_rating = excluded.private_rating, updated_at = now()
  returning * into result;
  return result;
end; $$;

create or replace function public.confirm_quest_attendance(p_quest_id uuid, p_user_id uuid, p_attended boolean)
returns public.quest_followups
language plpgsql security definer set search_path = public, pg_temp as $$
declare caller_id uuid := auth.uid(); quest_row public.quests%rowtype; result public.quest_followups%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;
  select * into quest_row from public.quests where id = p_quest_id;
  if quest_row.id is null or quest_row.creator_id <> caller_id then raise exception 'Only the host can confirm attendance.'; end if;
  if lower(coalesce(quest_row.status, 'open')) in ('cancelled', 'canceled') or (quest_row.completed_at is null and (quest_row.ends_at is null or quest_row.ends_at > now())) then raise exception 'This quest is not eligible for attendance confirmation.'; end if;
  if not exists (select 1 from public.quest_members m where m.quest_id = p_quest_id and m.user_id = p_user_id and m.status = 'approved') then raise exception 'Attendance can be confirmed only for approved attendees.'; end if;
  insert into public.quest_followups (quest_id, user_id, went, host_attendance) values (p_quest_id, p_user_id, null, p_attended)
  on conflict (quest_id, user_id) do update set host_attendance = excluded.host_attendance, updated_at = now()
  returning * into result;
  return result;
end; $$;

revoke all on function public.submit_quest_follow_up(uuid, boolean, smallint) from public, anon, authenticated;
revoke all on function public.confirm_quest_attendance(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_quest_lifecycle(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.invalidate_quest_completion_on_lifecycle_change() from public, anon, authenticated;
grant execute on function public.submit_quest_follow_up(uuid, boolean, smallint) to authenticated;
grant execute on function public.confirm_quest_attendance(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_quest_lifecycle(uuid, timestamptz, boolean) to authenticated;

comment on table public.quest_followups is 'Private, participant/host submissions only. Conflicting attendee and host values are disputed; no automatic no-show or penalty follows.';
