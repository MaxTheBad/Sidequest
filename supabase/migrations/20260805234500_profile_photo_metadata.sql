-- Preserve original profile photos so users can adjust their crop later.
alter table public.profiles
  add column if not exists avatar_source_url text,
  add column if not exists avatar_capture_method text,
  add column if not exists photo_onboarding_done boolean not null default false;

