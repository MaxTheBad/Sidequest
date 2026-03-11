-- One-time legacy cleanup for exact-address visibility
-- Run in Supabase SQL editor

begin;

-- 1) Normalize old/null visibility values to private (safer default)
update public.quests
set exact_location_visibility = 'private'
where exact_location_visibility is null;

-- 2) Remove exact-address access for users who are no longer approved members
-- (or no longer members at all)
delete from public.quest_exact_location_access qela
where not exists (
  select 1
  from public.quest_members qm
  where qm.quest_id = qela.quest_id
    and qm.user_id = qela.user_id
    and coalesce(qm.status, 'approved') = 'approved'
);

-- 3) If listing is private, only explicit manual grants should remain.
-- (No-op for good data, but keeps behavior consistent for legacy rows.)
-- If you want to fully reset private-listing access, uncomment below:
-- delete from public.quest_exact_location_access qela
-- using public.quests q
-- where q.id = qela.quest_id
--   and q.exact_location_visibility = 'private';

commit;
