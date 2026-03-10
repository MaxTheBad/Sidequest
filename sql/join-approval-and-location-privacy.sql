-- Join approval flow + exact-location privacy controls

alter table if exists public.quests
  add column if not exists join_mode text not null default 'open' check (join_mode in ('open','approval_required')),
  add column if not exists exact_location_visibility text not null default 'private' check (exact_location_visibility in ('private','public','approved_members')),
  add column if not exists exact_address text,
  add column if not exists exact_lat double precision,
  add column if not exists exact_lng double precision,
  add column if not exists public_lat double precision,
  add column if not exists public_lng double precision;

alter table if exists public.quest_members
  add column if not exists status text not null default 'approved' check (status in ('pending','approved'));

create table if not exists public.quest_exact_location_access (
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);

alter table public.quest_exact_location_access enable row level security;

create policy if not exists "exact access visible to signed in"
on public.quest_exact_location_access for select
using (auth.uid() is not null);

create policy if not exists "listing owner manages exact access"
on public.quest_exact_location_access for all
using (
  exists (
    select 1 from public.quests q
    where q.id = quest_id and q.creator_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.quests q
    where q.id = quest_id and q.creator_id = auth.uid()
  )
);

-- host can approve pending members
create policy if not exists "listing owner updates memberships"
on public.quest_members for update
using (
  exists (
    select 1 from public.quests q
    where q.id = quest_id and q.creator_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.quests q
    where q.id = quest_id and q.creator_id = auth.uid()
  )
);

-- users can cancel their own pending/approved request (but not creator row)
drop policy if exists "users leave own quest memberships" on public.quest_members;
create policy if not exists "users leave own quest memberships"
on public.quest_members for delete
using (auth.uid() = user_id and role <> 'creator');
