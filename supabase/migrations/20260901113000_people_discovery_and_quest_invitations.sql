alter table public.profiles
  add column if not exists people_discovery_enabled boolean not null default false;

create table if not exists public.people_discovery_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date,
  gender_identity text,
  latitude double precision,
  longitude double precision,
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_discovery_gender_length check (gender_identity is null or char_length(gender_identity) <= 80),
  constraint people_discovery_latitude check (latitude is null or latitude between -90 and 90),
  constraint people_discovery_longitude check (longitude is null or longitude between -180 and 180)
);

alter table public.people_discovery_settings enable row level security;

revoke all on table public.people_discovery_settings from anon, authenticated;
grant select on table public.people_discovery_settings to authenticated;

drop policy if exists people_discovery_settings_select_own on public.people_discovery_settings;
create policy people_discovery_settings_select_own
on public.people_discovery_settings for select to authenticated
using (auth.uid() = user_id);

drop policy if exists people_discovery_settings_insert_own on public.people_discovery_settings;
create policy people_discovery_settings_insert_own
on public.people_discovery_settings for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists people_discovery_settings_update_own on public.people_discovery_settings;
create policy people_discovery_settings_update_own
on public.people_discovery_settings for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.guard_people_discovery_opt_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.people_discovery_enabled and (tg_op = 'INSERT' or not coalesce(old.people_discovery_enabled, false)) then
    if not exists (
      select 1
      from public.people_discovery_settings s
      where s.user_id = new.id
        and s.birth_date <= current_date - interval '18 years'
        and s.latitude is not null
        and s.longitude is not null
    ) then
      raise exception 'Complete the protected 18+ discovery setup before opting in.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_people_discovery_opt_in on public.profiles;
create trigger profiles_guard_people_discovery_opt_in
before insert or update of people_discovery_enabled on public.profiles
for each row execute function public.guard_people_discovery_opt_in();

create table if not exists public.quest_invitations (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint quest_invitations_not_self check (sender_id <> recipient_id),
  constraint quest_invitations_message_length check (message is null or char_length(message) <= 500)
);

create unique index if not exists quest_invitations_one_pending_per_quest_recipient
  on public.quest_invitations (quest_id, recipient_id)
  where status = 'pending';
create index if not exists quest_invitations_recipient_created_idx
  on public.quest_invitations (recipient_id, created_at desc);
create index if not exists quest_invitations_sender_created_idx
  on public.quest_invitations (sender_id, created_at desc);

alter table public.quest_invitations enable row level security;

drop policy if exists quest_invitations_participants_read on public.quest_invitations;
create policy quest_invitations_participants_read
on public.quest_invitations for select to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

create or replace function public.update_people_discovery_settings(
  p_enabled boolean,
  p_birth_date date default null,
  p_gender_identity text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  clean_gender text := nullif(trim(coalesce(p_gender_identity, '')), '');
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;
  if clean_gender is not null and char_length(clean_gender) > 80 then
    raise exception 'Gender description is too long.';
  end if;
  if p_enabled and (p_birth_date is null or p_birth_date > current_date - interval '18 years') then
    raise exception 'People discovery is available to adults 18 and older.';
  end if;
  if p_enabled and (p_latitude is null or p_longitude is null) then
    raise exception 'Allow location once to calculate approximate distance.';
  end if;
  if p_latitude is not null and not (p_latitude between -90 and 90) then
    raise exception 'Invalid latitude.';
  end if;
  if p_longitude is not null and not (p_longitude between -180 and 180) then
    raise exception 'Invalid longitude.';
  end if;

  insert into public.people_discovery_settings (
    user_id, birth_date, gender_identity, latitude, longitude, location_updated_at, updated_at
  ) values (
    caller_id,
    p_birth_date,
    clean_gender,
    case when p_enabled then p_latitude else null end,
    case when p_enabled then p_longitude else null end,
    case when p_enabled then now() else null end,
    now()
  )
  on conflict (user_id) do update set
    birth_date = coalesce(excluded.birth_date, people_discovery_settings.birth_date),
    gender_identity = excluded.gender_identity,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location_updated_at = excluded.location_updated_at,
    updated_at = now();

  update public.profiles
  set people_discovery_enabled = p_enabled, updated_at = now()
  where id = caller_id;

  return true;
end;
$$;

revoke all on function public.update_people_discovery_settings(boolean, date, text, double precision, double precision) from public;
grant execute on function public.update_people_discovery_settings(boolean, date, text, double precision, double precision) to authenticated;

create or replace function public.find_people(
  p_min_age integer default 18,
  p_max_age integer default 100,
  p_gender_identities text[] default null,
  p_max_distance_km double precision default 40,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  city text,
  region text,
  gender_identity text,
  age integer,
  distance_km double precision,
  shared_interests integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_lat double precision;
  caller_lng double precision;
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = caller_id and p.people_discovery_enabled and p.deactivated_at is null
  ) then
    raise exception 'Turn on People discovery before browsing people.';
  end if;

  select s.latitude, s.longitude into caller_lat, caller_lng
  from public.people_discovery_settings s
  where s.user_id = caller_id;
  if caller_lat is null or caller_lng is null then
    raise exception 'Update your discovery location first.';
  end if;

  return query
  with candidates as (
    select
      p.id,
      p.display_name,
      p.username,
      p.avatar_url,
      p.bio,
      case when p.show_location then p.city else null end as city,
      case when p.show_location then p.region else null end as region,
      s.gender_identity,
      extract(year from age(current_date, s.birth_date))::integer as calculated_age,
      6371 * 2 * asin(sqrt(
        power(sin(radians(s.latitude - caller_lat) / 2), 2) +
        cos(radians(caller_lat)) * cos(radians(s.latitude)) *
        power(sin(radians(s.longitude - caller_lng) / 2), 2)
      )) as calculated_distance,
      (
        select count(*)::integer
        from public.user_hobbies mine
        join public.user_hobbies theirs on theirs.hobby_id = mine.hobby_id
        where mine.user_id = caller_id and theirs.user_id = p.id
      ) as calculated_shared_interests
    from public.profiles p
    join public.people_discovery_settings s on s.user_id = p.id
    where p.id <> caller_id
      and p.people_discovery_enabled
      and p.deactivated_at is null
      and p.moderation_status = 'active'
      and s.birth_date is not null
      and s.birth_date <= current_date - interval '18 years'
      and s.latitude is not null
      and s.longitude is not null
      and not exists (
        select 1 from public.friends f
        where f.status = 'blocked'
          and ((f.requester_id = caller_id and f.addressee_id = p.id)
            or (f.requester_id = p.id and f.addressee_id = caller_id))
      )
  )
  select
    c.id,
    c.display_name,
    c.username,
    c.avatar_url,
    c.bio,
    c.city,
    c.region,
    c.gender_identity,
    c.calculated_age,
    round(c.calculated_distance::numeric, 1)::double precision,
    c.calculated_shared_interests
  from candidates c
  where c.calculated_age between greatest(18, coalesce(p_min_age, 18)) and least(100, coalesce(p_max_age, 100))
    and c.calculated_distance <= least(250, greatest(1, coalesce(p_max_distance_km, 40)))
    and (p_gender_identities is null or cardinality(p_gender_identities) = 0 or c.gender_identity = any(p_gender_identities))
  order by c.calculated_shared_interests desc, c.calculated_distance asc, c.display_name asc nulls last
  limit least(100, greatest(1, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.find_people(integer, integer, text[], double precision, integer, integer) from public;
grant execute on function public.find_people(integer, integer, text[], double precision, integer, integer) to authenticated;

drop policy if exists messages_private_addressed_recipient_read on public.messages;
create policy messages_private_addressed_recipient_read
on public.messages for select to authenticated
using (body like ('[PRIVATE to=' || auth.uid()::text || '] %'));

create or replace function public.send_quest_invitation(
  p_quest_id uuid,
  p_recipient_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  invitation_id uuid;
  quest_title text;
  sender_name text;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;
  if caller_id = p_recipient_id then raise exception 'You cannot invite yourself.'; end if;
  if char_length(coalesce(p_message, '')) > 500 then raise exception 'Invitation message is too long.'; end if;

  select q.title into quest_title
  from public.quests q
  where q.id = p_quest_id
    and q.creator_id = caller_id
    and q.status = 'open'
    and (q.starts_at is null or q.starts_at > now());
  if quest_title is null then raise exception 'Only the host can invite people to an active quest.'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_recipient_id and p.people_discovery_enabled and p.deactivated_at is null
  ) then raise exception 'This person is not available for invitations.'; end if;

  if exists (
    select 1 from public.quest_members m
    where m.quest_id = p_quest_id and m.user_id = p_recipient_id and m.status = 'approved'
  ) then raise exception 'This person has already joined the quest.'; end if;

  insert into public.quest_invitations (quest_id, sender_id, recipient_id, message)
  values (p_quest_id, caller_id, p_recipient_id, nullif(trim(coalesce(p_message, '')), ''))
  returning id into invitation_id;

  select coalesce(p.display_name, p.username, 'A host') into sender_name
  from public.profiles p where p.id = caller_id;

  perform public.create_notification(
    p_recipient_id,
    'system',
    coalesce(sender_name, 'A host') || ' invited you',
    'Join "' || left(coalesce(quest_title, 'a quest'), 120) || '"' || case when nullif(trim(coalesce(p_message, '')), '') is null then '.' else ': ' || left(trim(p_message), 180) end,
    '/listing/' || p_quest_id::text,
    p_quest_id,
    caller_id,
    null,
    p_recipient_id,
    jsonb_build_object('kind', 'quest_invitation', 'invitation_id', invitation_id)
  );

  return invitation_id;
end;
$$;

revoke all on function public.send_quest_invitation(uuid, uuid, text) from public;
grant execute on function public.send_quest_invitation(uuid, uuid, text) to authenticated;

create or replace function public.respond_to_quest_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  invite_row public.quest_invitations%rowtype;
  quest_title text;
  recipient_name text;
  quest_capacity integer;
  approved_count integer;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;

  select * into invite_row
  from public.quest_invitations i
  where i.id = p_invitation_id and i.recipient_id = caller_id and i.status = 'pending'
  for update;
  if invite_row.id is null then raise exception 'This invitation is no longer available.'; end if;

  select q.title, q.group_size into quest_title, quest_capacity from public.quests q
  where q.id = invite_row.quest_id and q.status = 'open' and (q.starts_at is null or q.starts_at > now());
  if quest_title is null then
    update public.quest_invitations set status = 'expired', responded_at = now() where id = invite_row.id;
    raise exception 'This quest is no longer accepting guests.';
  end if;

  if p_accept and coalesce(quest_capacity, 0) > 0 then
    perform 1 from public.quests q where q.id = invite_row.quest_id for update;
    select count(*)::integer into approved_count
    from public.quest_members m
    where m.quest_id = invite_row.quest_id and m.status = 'approved' and m.role <> 'creator';
    if approved_count >= quest_capacity then
      update public.quest_invitations set status = 'expired', responded_at = now() where id = invite_row.id;
      raise exception 'This quest is already full.';
    end if;
  end if;

  update public.quest_invitations
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = invite_row.id;

  if p_accept then
    insert into public.quest_members (quest_id, user_id, role, status, joined_at)
    values (invite_row.quest_id, caller_id, 'member', 'approved', now())
    on conflict (quest_id, user_id) do update set status = 'approved', joined_at = now();
  end if;

  select coalesce(p.display_name, p.username, 'Someone') into recipient_name
  from public.profiles p where p.id = caller_id;

  perform public.create_notification(
    invite_row.sender_id,
    'system',
    case when p_accept then coalesce(recipient_name, 'Someone') || ' accepted your invitation' else coalesce(recipient_name, 'Someone') || ' declined your invitation' end,
    case when p_accept then 'They are now approved for "' || left(quest_title, 120) || '".' else 'Invitation for "' || left(quest_title, 120) || '" declined.' end,
    '/listing/' || invite_row.quest_id::text,
    invite_row.quest_id,
    caller_id,
    null,
    caller_id,
    jsonb_build_object('kind', case when p_accept then 'quest_invitation_accepted' else 'quest_invitation_declined' end, 'invitation_id', invite_row.id)
  );

  return true;
end;
$$;

revoke all on function public.respond_to_quest_invitation(uuid, boolean) from public;
grant execute on function public.respond_to_quest_invitation(uuid, boolean) to authenticated;
