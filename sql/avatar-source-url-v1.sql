-- Optional avatar source migration for Side Quest
-- Stores the original uploaded photo so users can re-crop later.

alter table public.profiles
  add column if not exists avatar_source_url text;
