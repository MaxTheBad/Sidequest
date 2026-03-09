-- Run this if you're missing bookmarks/messages visibility behavior

-- 1) quest_bookmarks table
create table if not exists public.quest_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

alter table public.quest_bookmarks enable row level security;

drop policy if exists "users read own bookmarks" on public.quest_bookmarks;
create policy "users read own bookmarks"
on public.quest_bookmarks for select
using (auth.uid() = user_id);

drop policy if exists "users manage own bookmarks" on public.quest_bookmarks;
create policy "users manage own bookmarks"
on public.quest_bookmarks for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2) message visibility by mode + sender visibility
drop policy if exists "messages readable" on public.messages;
drop policy if exists "messages readable by participants" on public.messages;
drop policy if exists "messages readable by mode" on public.messages;

create policy "messages readable by mode"
on public.messages for select
using (
  auth.uid() = sender_id
  or (
    body like '[PUBLIC] %'
    and exists (
      select 1 from public.quest_members qm
      where qm.quest_id = messages.quest_id and qm.user_id = auth.uid()
    )
  )
  or (
    body like '[PRIVATE] %'
    and exists (
      select 1 from public.quests q
      where q.id = messages.quest_id and q.creator_id = auth.uid()
    )
  )
  or (
    body not like '[PUBLIC] %'
    and body not like '[PRIVATE] %'
    and exists (
      select 1 from public.quest_members qm
      where qm.quest_id = messages.quest_id and qm.user_id = auth.uid()
    )
  )
);

-- keep existing insert policy for sender
