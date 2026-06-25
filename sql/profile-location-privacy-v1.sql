-- Profile location privacy
-- Hidden by default. Stores a per-profile toggle for whether location can be shown publicly.

alter table public.profiles
  add column if not exists region text,
  add column if not exists country_code text,
  add column if not exists show_location boolean not null default false;
