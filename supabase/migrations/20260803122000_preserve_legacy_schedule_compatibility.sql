-- Keep the currently distributed TestFlight build working during rollout.
-- The V1 clients require starts_at, but the previous client can still submit
-- its legacy "decide together" option until users receive the next build.
alter table public.quests
  drop constraint if exists quests_v1_start_time_required;
