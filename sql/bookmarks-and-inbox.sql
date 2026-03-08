-- Side Quest: bookmarks + tighter inbox policies

create table if not exists public.quest_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

alter table public.quest_bookmarks enable row level security;

create policy if not exists "users read own bookmarks"
on public.quest_bookmarks for select
using (auth.uid() = user_id);

create policy if not exists "users manage own bookmarks"
on public.quest_bookmarks for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Optional stricter messages policy for production:
-- users can read messages they sent OR messages on quests they own.
drop policy if exists "messages readable" on public.messages;

create policy if not exists "messages readable by participants"
on public.messages for select
using (
  auth.uid() = sender_id
  or exists (
    select 1
    from public.quests q
    where q.id = messages.quest_id
      and q.creator_id = auth.uid()
  )
);
