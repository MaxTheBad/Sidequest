-- Row-level security cannot hide individual columns. Isolate non-public meetup
-- addresses so reading a public quest row can never reveal a protected address.
create table if not exists public.quest_private_locations (
  quest_id uuid primary key references public.quests(id) on delete cascade,
  exact_address text null,
  exact_lat double precision null,
  exact_lng double precision null,
  updated_at timestamptz not null default now()
);

alter table public.quest_private_locations enable row level security;
revoke all on public.quest_private_locations from public, anon, authenticated;
grant select on public.quest_private_locations to authenticated;

drop policy if exists quest_private_locations_authorized_read on public.quest_private_locations;
create policy quest_private_locations_authorized_read
on public.quest_private_locations
for select
to authenticated
using (
  exists (
    select 1
    from public.quests q
    where q.id = quest_private_locations.quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1 from public.quest_members manager
          where manager.quest_id = q.id
            and manager.user_id = auth.uid()
            and manager.role = 'cohost'
            and manager.status = 'approved'
        )
        or exists (
          select 1 from public.quest_exact_location_access access
          where access.quest_id = q.id
            and access.user_id = auth.uid()
        )
      )
  )
);

-- Access-list rows themselves are private. A user may see their own grant;
-- hosts/cohosts may see the grants they manage.
drop policy if exists "exact access visible to signed in" on public.quest_exact_location_access;
drop policy if exists quest_exact_access_authorized_read on public.quest_exact_location_access;
create policy quest_exact_access_authorized_read
on public.quest_exact_location_access
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.quests q
    where q.id = quest_exact_location_access.quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1 from public.quest_members manager
          where manager.quest_id = q.id
            and manager.user_id = auth.uid()
            and manager.role = 'cohost'
            and manager.status = 'approved'
        )
      )
  )
);

-- Move existing protected locations before scrubbing the public rows.
insert into public.quest_private_locations (quest_id, exact_address, exact_lat, exact_lng)
select id, exact_address, exact_lat, exact_lng
from public.quests
where coalesce(exact_location_visibility, 'private') <> 'public'
  and (exact_address is not null or exact_lat is not null or exact_lng is not null)
on conflict (quest_id) do update set
  exact_address = excluded.exact_address,
  exact_lat = excluded.exact_lat,
  exact_lng = excluded.exact_lng,
  updated_at = now();

update public.quests
set exact_address = null, exact_lat = null, exact_lng = null
where coalesce(exact_location_visibility, 'private') <> 'public'
  and (exact_address is not null or exact_lat is not null or exact_lng is not null);

create or replace function public.protect_updated_quest_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.exact_location_visibility, 'private') = 'public' then
    delete from public.quest_private_locations where quest_id = new.id;
    return new;
  end if;

  if new.exact_address is not null or new.exact_lat is not null or new.exact_lng is not null then
    insert into public.quest_private_locations (quest_id, exact_address, exact_lat, exact_lng)
    values (new.id, new.exact_address, new.exact_lat, new.exact_lng)
    on conflict (quest_id) do update set
      exact_address = excluded.exact_address,
      exact_lat = excluded.exact_lat,
      exact_lng = excluded.exact_lng,
      updated_at = now();
  end if;

  new.exact_address := null;
  new.exact_lat := null;
  new.exact_lng := null;
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
     and (new.exact_address is not null or new.exact_lat is not null or new.exact_lng is not null) then
    insert into public.quest_private_locations (quest_id, exact_address, exact_lat, exact_lng)
    values (new.id, new.exact_address, new.exact_lat, new.exact_lng)
    on conflict (quest_id) do update set
      exact_address = excluded.exact_address,
      exact_lat = excluded.exact_lat,
      exact_lng = excluded.exact_lng,
      updated_at = now();

    update public.quests
       set exact_address = null, exact_lat = null, exact_lng = null
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists quests_protect_updated_location on public.quests;
create trigger quests_protect_updated_location
before update of exact_address, exact_lat, exact_lng, exact_location_visibility
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
