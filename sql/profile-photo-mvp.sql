-- Profile photo MVP (camera-first upload)
-- Run in Supabase SQL Editor

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_capture_method text,
  add column if not exists photo_onboarding_done boolean not null default false;

-- Optional: constrain capture method values
alter table public.profiles
  drop constraint if exists profiles_avatar_capture_method_check;

alter table public.profiles
  add constraint profiles_avatar_capture_method_check
  check (avatar_capture_method is null or avatar_capture_method in ('camera', 'gallery', 'unknown'));

-- Storage bucket for profile photos
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Storage policies: users can manage only their own files under <uid>/...
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
