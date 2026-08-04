alter table public.quests
  add column if not exists time_flexible boolean not null default false;

comment on column public.quests.time_flexible is
  'The quest has a concrete starts_at value, but the host is open to adjusting it.';
