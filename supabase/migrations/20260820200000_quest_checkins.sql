-- Event-scoped presence. Coordinates supplied to the RPC are used only for
-- proximity validation and are never written to this table.
create table if not exists public.quest_checkins (
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);

create index if not exists quest_checkins_quest_time_idx
  on public.quest_checkins (quest_id, checked_in_at desc);

alter table public.quest_checkins enable row level security;
revoke all on public.quest_checkins from public, anon, authenticated;
grant select on public.quest_checkins to authenticated;

drop policy if exists quest_checkins_participant_read on public.quest_checkins;
create policy quest_checkins_participant_read
on public.quest_checkins
for select
to authenticated
using (
  exists (
    select 1
    from public.quests q
    where q.id = quest_checkins.quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1
          from public.quest_members viewer
          where viewer.quest_id = q.id
            and viewer.user_id = auth.uid()
            and viewer.status = 'approved'
        )
      )
  )
);

create or replace function public.check_in_to_quest(
  p_quest_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  quest_row public.quests%rowtype;
  target_lat double precision;
  target_lng double precision;
  distance_miles double precision;
  already_checked_in boolean;
  viewer_name text;
  recipient record;
  checked_time timestamptz;
begin
  if viewer_id is null then
    raise exception 'Sign in to check in.' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'We could not verify your location. Try again.' using errcode = 'P0001';
  end if;

  select * into quest_row from public.quests where id = p_quest_id;
  if quest_row.id is null then
    raise exception 'Quest not found.' using errcode = 'P0001';
  end if;
  if lower(coalesce(quest_row.city, '')) = 'virtual' then
    raise exception 'Online quests do not use arrival check-in.' using errcode = 'P0001';
  end if;
  if not (
    quest_row.creator_id = viewer_id
    or exists (
      select 1 from public.quest_members member
      where member.quest_id = p_quest_id
        and member.user_id = viewer_id
        and member.status = 'approved'
    )
  ) then
    raise exception 'Only the host and approved attendees can check in.' using errcode = 'P0001';
  end if;
  if quest_row.starts_at is not null
     and (now() < quest_row.starts_at - interval '4 hours' or now() > quest_row.starts_at + interval '12 hours') then
    raise exception 'Check-in opens four hours before the quest and closes twelve hours after it starts.' using errcode = 'P0001';
  end if;

  if quest_row.exact_lat is not null and quest_row.exact_lng is not null then
    target_lat := quest_row.exact_lat;
    target_lng := quest_row.exact_lng;
  else
    select exact_lat, exact_lng into target_lat, target_lng
    from public.quest_private_locations
    where quest_id = p_quest_id;
  end if;
  if target_lat is null or target_lng is null then
    raise exception 'The host needs to refresh this quest address before check-in can be verified.' using errcode = 'P0001';
  end if;

  distance_miles := 3958.7613 * 2 * asin(sqrt(
    power(sin(radians(p_lat - target_lat) / 2), 2)
    + cos(radians(target_lat)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - target_lng) / 2), 2)
  ));
  if distance_miles > 1.0 then
    raise exception 'You need to be within one mile of the meetup to check in.' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.quest_checkins
    where quest_id = p_quest_id and user_id = viewer_id
  ) into already_checked_in;

  insert into public.quest_checkins (quest_id, user_id, checked_in_at)
  values (p_quest_id, viewer_id, now())
  on conflict (quest_id, user_id) do update
    set checked_in_at = public.quest_checkins.checked_in_at
  returning checked_in_at into checked_time;

  if not already_checked_in then
    select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Someone')
      into viewer_name from public.profiles where id = viewer_id;

    if quest_row.creator_id = viewer_id then
      for recipient in
        select distinct member.user_id
        from public.quest_members member
        where member.quest_id = p_quest_id
          and member.status = 'approved'
          and member.user_id <> viewer_id
      loop
        perform public.create_notification(
          recipient.user_id, 'system', 'Your host is here',
          viewer_name || ' checked in for "' || left(coalesce(quest_row.title, 'this quest'), 90) || '".',
          '/listing/' || p_quest_id::text, p_quest_id, viewer_id, null, null,
          jsonb_build_object('kind', 'quest_check_in', 'role', 'host')
        );
      end loop;
    else
      for recipient in
        select distinct recipient_id from (
          select quest_row.creator_id as recipient_id
          union
          select member.user_id
          from public.quest_members member
          where member.quest_id = p_quest_id
            and member.status = 'approved'
            and member.role = 'cohost'
        ) recipients
        where recipient_id is not null and recipient_id <> viewer_id
      loop
        perform public.create_notification(
          recipient.recipient_id, 'system', viewer_name || ' is here',
          viewer_name || ' checked in for "' || left(coalesce(quest_row.title, 'this quest'), 90) || '".',
          '/listing/' || p_quest_id::text, p_quest_id, viewer_id, null, null,
          jsonb_build_object('kind', 'quest_check_in', 'role', 'attendee')
        );
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'checked_in_at', checked_time,
    'distance_miles', round(distance_miles::numeric, 3),
    'accuracy_m', p_accuracy_m
  );
end;
$$;

create or replace function public.leave_quest_check_in(p_quest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_rows integer;
begin
  if auth.uid() is null then return false; end if;
  delete from public.quest_checkins
  where quest_id = p_quest_id and user_id = auth.uid();
  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.check_in_to_quest(uuid, double precision, double precision, double precision) from public, anon;
revoke all on function public.leave_quest_check_in(uuid) from public, anon;
grant execute on function public.check_in_to_quest(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.leave_quest_check_in(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.quest_checkins;
exception when duplicate_object then null;
end $$;
