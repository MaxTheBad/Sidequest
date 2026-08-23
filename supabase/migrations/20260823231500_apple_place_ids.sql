-- Apple Place IDs are stable references that Apple explicitly permits apps to
-- retain. Keep private Place IDs alongside the protected meetup address.

alter table public.quests
  add column if not exists apple_place_id text null;

alter table public.quest_private_locations
  add column if not exists apple_place_id text null;

alter table public.quests
  drop constraint if exists quests_apple_place_id_length;
alter table public.quests
  add constraint quests_apple_place_id_length
  check (apple_place_id is null or char_length(apple_place_id) <= 500) not valid;

alter table public.quest_private_locations
  drop constraint if exists quest_private_locations_apple_place_id_length;
alter table public.quest_private_locations
  add constraint quest_private_locations_apple_place_id_length
  check (apple_place_id is null or char_length(apple_place_id) <= 500) not valid;

create or replace function public.protect_updated_quest_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.location_details := nullif(btrim(new.location_details), '');
  new.apple_place_id := nullif(btrim(new.apple_place_id), '');

  if coalesce(new.exact_location_visibility, 'private') = 'public' then
    delete from public.quest_private_locations where quest_id = new.id;
    return new;
  end if;

  if new.exact_address is not null
     or new.exact_lat is not null
     or new.exact_lng is not null
     or new.location_details is not null
     or new.apple_place_id is not null then
    insert into public.quest_private_locations
      (quest_id, exact_address, exact_lat, exact_lng, location_details, apple_place_id)
    values
      (new.id, new.exact_address, new.exact_lat, new.exact_lng, new.location_details, new.apple_place_id)
    on conflict (quest_id) do update set
      exact_address = excluded.exact_address,
      exact_lat = excluded.exact_lat,
      exact_lng = excluded.exact_lng,
      location_details = excluded.location_details,
      apple_place_id = excluded.apple_place_id,
      updated_at = now();
  end if;

  new.exact_address := null;
  new.exact_lat := null;
  new.exact_lng := null;
  new.location_details := null;
  new.apple_place_id := null;
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
       or nullif(btrim(new.apple_place_id), '') is not null
     ) then
    insert into public.quest_private_locations
      (quest_id, exact_address, exact_lat, exact_lng, location_details, apple_place_id)
    values
      (new.id, new.exact_address, new.exact_lat, new.exact_lng,
       nullif(btrim(new.location_details), ''), nullif(btrim(new.apple_place_id), ''))
    on conflict (quest_id) do update set
      exact_address = excluded.exact_address,
      exact_lat = excluded.exact_lat,
      exact_lng = excluded.exact_lng,
      location_details = excluded.location_details,
      apple_place_id = excluded.apple_place_id,
      updated_at = now();

    update public.quests
       set exact_address = null,
           exact_lat = null,
           exact_lng = null,
           location_details = null,
           apple_place_id = null
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists quests_protect_updated_location on public.quests;
create trigger quests_protect_updated_location
before update of exact_address, exact_lat, exact_lng, location_details, apple_place_id, exact_location_visibility
on public.quests
for each row execute function public.protect_updated_quest_location();

drop trigger if exists quests_protect_inserted_location on public.quests;
create trigger quests_protect_inserted_location
after insert on public.quests
for each row execute function public.protect_inserted_quest_location();
