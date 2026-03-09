-- Friends table + policies + sender visibility in public messages

create table if not exists public.friends (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friends enable row level security;

drop policy if exists "friends readable by participants" on public.friends;
create policy "friends readable by participants"
on public.friends for select
using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends insert own requests" on public.friends;
create policy "friends insert own requests"
on public.friends for insert
with check (auth.uid() = requester_id);

drop policy if exists "friends update participants" on public.friends;
create policy "friends update participants"
on public.friends for update
using (auth.uid() = requester_id or auth.uid() = addressee_id)
with check (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Message visibility fix: sender should always see own public/private message

drop policy if exists "messages readable by mode" on public.messages;
create policy "messages readable by mode"
on public.messages for select
using (
  auth.uid() = sender_id
  or (
    body like '[PUBLIC] %'
    and exists (
      select 1
      from public.quest_members qm
      where qm.quest_id = messages.quest_id
        and qm.user_id = auth.uid()
    )
  )
  or (
    body like '[PRIVATE] %'
    and exists (
      select 1
      from public.quests q
      where q.id = messages.quest_id
        and q.creator_id = auth.uid()
    )
  )
  or (
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
