-- Public messages visible to any signed-in user

drop policy if exists "messages readable by mode" on public.messages;

create policy "messages readable by mode"
on public.messages for select
using (
  auth.uid() = sender_id
  or (body like '[PUBLIC] %' and auth.uid() is not null)
  or (
    body like '[PRIVATE] %'
    and exists (
      select 1 from public.quests q
      where q.id = messages.quest_id
        and q.creator_id = auth.uid()
    )
  )
  or (
    body not like '[PUBLIC] %'
    and body not like '[PRIVATE] %'
    and auth.uid() is not null
  )
);
