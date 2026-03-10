-- Phase 2: co-host role + declined request state + manager policies

-- Expand quest member roles to include cohost
alter table if exists public.quest_members drop constraint if exists quest_members_role_check;
alter table if exists public.quest_members
  add constraint quest_members_role_check check (role in ('creator','cohost','member'));

-- Expand member status to include declined
alter table if exists public.quest_members drop constraint if exists quest_members_status_check;
alter table if exists public.quest_members
  add constraint quest_members_status_check check (status in ('pending','approved','declined'));

-- Allow listing owner OR approved co-host to update memberships
-- (approve/decline requests, etc.)
drop policy if exists "listing owner updates memberships" on public.quest_members;
create policy "listing owner or cohost updates memberships"
on public.quest_members
for update
using (
  exists (
    select 1
    from public.quests q
    where q.id = quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1
          from public.quest_members qm
          where qm.quest_id = q.id
            and qm.user_id = auth.uid()
            and qm.role = 'cohost'
            and qm.status = 'approved'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.quests q
    where q.id = quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1
          from public.quest_members qm
          where qm.quest_id = q.id
            and qm.user_id = auth.uid()
            and qm.role = 'cohost'
            and qm.status = 'approved'
        )
      )
  )
);

-- Allow listing owner OR approved co-host to manage exact-location grants
drop policy if exists "listing owner manages exact access" on public.quest_exact_location_access;
create policy "listing owner or cohost manages exact access"
on public.quest_exact_location_access
for all
using (
  exists (
    select 1
    from public.quests q
    where q.id = quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1
          from public.quest_members qm
          where qm.quest_id = q.id
            and qm.user_id = auth.uid()
            and qm.role = 'cohost'
            and qm.status = 'approved'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.quests q
    where q.id = quest_id
      and (
        q.creator_id = auth.uid()
        or exists (
          select 1
          from public.quest_members qm
          where qm.quest_id = q.id
            and qm.user_id = auth.uid()
            and qm.role = 'cohost'
            and qm.status = 'approved'
        )
      )
  )
);
