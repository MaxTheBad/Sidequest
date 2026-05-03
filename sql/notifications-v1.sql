-- Persistent notification read state

create table if not exists public.notification_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_state enable row level security;

drop policy if exists "users read own notification state" on public.notification_state;
create policy "users read own notification state"
on public.notification_state for select
using (auth.uid() = user_id);

drop policy if exists "users manage own notification state" on public.notification_state;
create policy "users manage own notification state"
on public.notification_state for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
