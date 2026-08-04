alter table public.quests
  drop constraint if exists quests_v1_start_time_required;

alter table public.quests
  add constraint quests_v1_start_time_required
  check (starts_at is not null) not valid;

comment on constraint quests_v1_start_time_required on public.quests is
  'V1 quests require one concrete start time. NOT VALID preserves legacy unscheduled rows while enforcing new writes.';
