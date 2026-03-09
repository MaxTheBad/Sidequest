-- SideQuest fixes: avatar persistence + leave listing permissions

-- 1) Ensure profile photo columns exist
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_capture_method text,
  add column if not exists photo_onboarding_done boolean not null default false;

-- 2) Ensure profile photo bucket + policies exist
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

create policy if not exists "profile photos public read"
on storage.objects for select
using (bucket_id = 'profile-photos');

create policy if not exists "users upload own profile photo"
on storage.objects for insert
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy if not exists "users update own profile photo"
on storage.objects for update
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy if not exists "users delete own profile photo"
on storage.objects for delete
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 3) Ensure users can update their own profile row
create policy if not exists "users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy if not exists "users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

-- 4) Ensure users can leave listings (delete own membership)
create policy if not exists "users leave own quest memberships"
on public.quest_members for delete
using (auth.uid() = user_id and role <> 'creator');

-- 5) Prevent duplicate membership rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quest_members_unique_membership'
  ) THEN
    ALTER TABLE public.quest_members
      ADD CONSTRAINT quest_members_unique_membership UNIQUE (quest_id, user_id);
  END IF;
END $$;
