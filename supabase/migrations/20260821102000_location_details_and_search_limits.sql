-- Keep meeting instructions protected with the exact address and enforce
-- server-side address-search quotas before any external provider is called.

alter table public.quests
  add column if not exists location_details text null;

alter table public.quest_private_locations
  add column if not exists location_details text null;

alter table public.quests
  drop constraint if exists quests_location_details_length;
alter table public.quests
  add constraint quests_location_details_length
  check (location_details is null or char_length(location_details) <= 240) not valid;

alter table public.quest_private_locations
  drop constraint if exists quest_private_locations_details_length;
alter table public.quest_private_locations
  add constraint quest_private_locations_details_length
  check (location_details is null or char_length(location_details) <= 240) not valid;

create or replace function public.protect_updated_quest_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.location_details := nullif(btrim(new.location_details), '');

  if coalesce(new.exact_location_visibility, 'private') = 'public' then
    delete from public.quest_private_locations where quest_id = new.id;
    return new;
  end if;

  if new.exact_address is not null
     or new.exact_lat is not null
     or new.exact_lng is not null
     or new.location_details is not null then
    insert into public.quest_private_locations (quest_id, exact_address, exact_lat, exact_lng, location_details)
    values (new.id, new.exact_address, new.exact_lat, new.exact_lng, new.location_details)
    on conflict (quest_id) do update set
      exact_address = excluded.exact_address,
      exact_lat = excluded.exact_lat,
      exact_lng = excluded.exact_lng,
      location_details = excluded.location_details,
      updated_at = now();
  end if;

  new.exact_address := null;
  new.exact_lat := null;
  new.exact_lng := null;
  new.location_details := null;
  return new;
end;
$$;

create or replace function public.protect_inserted_quest_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.exact_location_visibility, 'private') <> 'public'
     and (
       new.exact_address is not null
       or new.exact_lat is not null
       or new.exact_lng is not null
       or nullif(btrim(new.location_details), '') is not null
     ) then
    insert into public.quest_private_locations (quest_id, exact_address, exact_lat, exact_lng, location_details)
    values (new.id, new.exact_address, new.exact_lat, new.exact_lng, nullif(btrim(new.location_details), ''))
    on conflict (quest_id) do update set
      exact_address = excluded.exact_address,
      exact_lat = excluded.exact_lat,
      exact_lng = excluded.exact_lng,
      location_details = excluded.location_details,
      updated_at = now();

    update public.quests
       set exact_address = null,
           exact_lat = null,
           exact_lng = null,
           location_details = null
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists quests_protect_updated_location on public.quests;
create trigger quests_protect_updated_location
before update of exact_address, exact_lat, exact_lng, location_details, exact_location_visibility
on public.quests
for each row execute function public.protect_updated_quest_location();

drop trigger if exists quests_protect_inserted_location on public.quests;
create trigger quests_protect_inserted_location
after insert on public.quests
for each row execute function public.protect_inserted_quest_location();

revoke all on function public.protect_updated_quest_location() from public, anon, authenticated;
revoke all on function public.protect_inserted_quest_location() from public, anon, authenticated;
grant execute on function public.protect_updated_quest_location() to service_role;
grant execute on function public.protect_inserted_quest_location() to service_role;

create table if not exists public.location_search_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple_native', 'apple_server')),
  created_at timestamptz not null default now()
);

create index if not exists location_search_usage_user_created_idx
  on public.location_search_usage (user_id, created_at desc);

alter table public.location_search_usage enable row level security;
revoke all on public.location_search_usage from public, anon, authenticated;
grant select, insert, delete on public.location_search_usage to service_role;
grant usage, select on sequence public.location_search_usage_id_seq to service_role;

create or replace function public.consume_location_search_quota(
  p_user_id uuid,
  p_provider text,
  p_daily_limit integer default 30,
  p_burst_limit integer default 5
)
returns table (
  allowed boolean,
  daily_used integer,
  daily_remaining integer,
  retry_after_seconds integer,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_daily_used integer;
  v_burst_used integer;
  v_oldest_burst timestamptz;
begin
  if p_user_id is null or p_provider not in ('apple_native', 'apple_server') then
    return query select false, 0, 0, 60, 'invalid_request'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('location-search:' || p_user_id::text, 0));

  select count(*)::integer into v_daily_used
  from public.location_search_usage
  where user_id = p_user_id
    and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  if v_daily_used >= p_daily_limit then
    return query select false, v_daily_used, 0,
      greatest(1, extract(epoch from ((date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC' - now()))::integer),
      'daily_limit'::text;
    return;
  end if;

  select count(*)::integer, min(created_at) into v_burst_used, v_oldest_burst
  from public.location_search_usage
  where user_id = p_user_id
    and created_at >= now() - interval '1 minute';

  if v_burst_used >= p_burst_limit then
    return query select false, v_daily_used, greatest(0, p_daily_limit - v_daily_used),
      greatest(1, extract(epoch from (v_oldest_burst + interval '1 minute' - now()))::integer),
      'burst_limit'::text;
    return;
  end if;

  insert into public.location_search_usage (user_id, provider)
  values (p_user_id, p_provider);

  v_daily_used := v_daily_used + 1;
  return query select true, v_daily_used, greatest(0, p_daily_limit - v_daily_used), 0, null::text;
end;
$$;

revoke all on function public.consume_location_search_quota(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_location_search_quota(uuid, text, integer, integer)
  to service_role;

