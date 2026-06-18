-- Optional onboarding migration for GatherGo
-- Adds a durable "has completed onboarding" flag on profiles.

alter table public.profiles
  add column if not exists onboarding_done boolean not null default false;
