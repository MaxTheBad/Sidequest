-- QuestHat v1 schema
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text,
  username_changed_at timestamptz,
  city text,
  bio text,
  role text not null default 'user' check (role in ('user','moderator','admin','super_admin')),
  skill_level text check (skill_level in ('beginner','returning','intermediate','advanced')) default 'beginner',
  availability text,
  radius_km int default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.enforce_profile_username()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  if new.username is null or btrim(new.username) = '' then
    new.username := null;
    return new;
  end if;

  normalized := lower(btrim(new.username));
  if normalized !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = '22023',
      message = 'Username must be 3-30 characters and use only letters, numbers, or underscores.';
  end if;

  new.username := normalized;
  if tg_op = 'INSERT' or old.username is null then
    new.username_changed_at := now();
  elsif lower(old.username) is distinct from normalized then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '24 hours' then
      raise exception using errcode = 'P0001',
        message = 'You can only change your username once every 24 hours.';
    end if;
    new.username_changed_at := now();
  else
    new.username_changed_at := old.username_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_username_trigger on public.profiles;
create trigger enforce_profile_username_trigger
before insert or update of username on public.profiles
for each row execute function public.enforce_profile_username();

create table if not exists public.hobbies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_hobbies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  hobby_id uuid not null references public.hobbies(id) on delete cascade,
  is_primary boolean default false,
  created_at timestamptz not null default now(),
  primary key (user_id, hobby_id)
);

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  hobby_id uuid not null references public.hobbies(id) on delete restrict,
  title text not null,
  description text,
  city text,
  is_online boolean default false,
  skill_level text check (skill_level in ('beginner','returning','intermediate','advanced')) default 'beginner',
  group_size int not null default 4,
  availability text,
  status text not null default 'open' check (status in ('open','full','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.quest_members (
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('creator','member')),
  joined_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Helpful starter hobbies
insert into public.hobbies (slug, name, category) values
('tennis','Tennis','Sports'),
('table-tennis','Table Tennis','Sports'),
('pool','Pool','Indoor Games'),
('pickleball','Pickleball','Sports'),
('running','Running','Fitness'),
('climbing','Climbing','Outdoor')
on conflict (slug) do nothing;

-- RLS
alter table public.profiles enable row level security;
alter table public.hobbies enable row level security;
alter table public.user_hobbies enable row level security;
alter table public.quests enable row level security;
alter table public.quest_members enable row level security;
alter table public.messages enable row level security;

-- Profiles
create policy if not exists "profiles are viewable by everyone"
on public.profiles for select using (true);

create policy if not exists "users can insert own profile"
on public.profiles for insert with check (auth.uid() = id);

create policy if not exists "users can update own profile"
on public.profiles for update using (auth.uid() = id);

-- Hobbies read-only
create policy if not exists "hobbies readable"
on public.hobbies for select using (true);

-- User hobbies
create policy if not exists "user_hobbies readable"
on public.user_hobbies for select using (true);

create policy if not exists "users manage own hobbies"
on public.user_hobbies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Quests
create policy if not exists "quests readable"
on public.quests for select using (true);

create policy if not exists "users create quests"
on public.quests for insert with check (auth.uid() = creator_id);

create policy if not exists "creator updates own quests"
on public.quests for update using (auth.uid() = creator_id);

-- Members
create policy if not exists "members readable"
on public.quest_members for select using (true);

create policy if not exists "users join quests"
on public.quest_members for insert with check (auth.uid() = user_id);

-- Messages
create policy if not exists "messages readable"
on public.messages for select using (true);

create policy if not exists "users send messages"
on public.messages for insert with check (auth.uid() = sender_id);
