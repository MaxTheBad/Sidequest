-- Messages visibility rules:
-- - Public messages: visible to quest participants (creator + members)
-- - Private messages: visible to sender and quest creator only

drop policy if exists "messages readable" on public.messages;
drop policy if exists "messages readable by participants" on public.messages;

create policy "messages readable by mode"
on public.messages for select
using (
  (
    body like '[PUBLIC] %'
    and exists (
      select 1
      from public.quest_members qm
      where qm.quest_id = messages.quest_id
        and qm.user_id = auth.uid()
    )
  )
  or
  (
    body like '[PRIVATE] %'
    and (
      auth.uid() = sender_id
      or exists (
        select 1
        from public.quests q
        where q.id = messages.quest_id
          and q.creator_id = auth.uid()
      )
    )
  )
  or
  (
    body not like '[PUBLIC] %'
    and body not like '[PRIVATE] %'
    and exists (
      select 1
      from public.quest_members qm
      where qm.quest_id = messages.quest_id
        and qm.user_id = auth.uid()
    )
  )
);
