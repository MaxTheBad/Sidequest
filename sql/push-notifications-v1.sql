-- Push notification device tokens for QuestHat

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'ios',
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_tokens_user_token_idx
  on public.push_tokens (user_id, expo_push_token);

create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id, active, updated_at desc);

alter table public.push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.push_tokens;
create policy "users read own push tokens"
on public.push_tokens for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users insert own push tokens" on public.push_tokens;
create policy "users insert own push tokens"
on public.push_tokens for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users update own push tokens" on public.push_tokens;
create policy "users update own push tokens"
on public.push_tokens for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users delete own push tokens" on public.push_tokens;
create policy "users delete own push tokens"
on public.push_tokens for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.touch_push_tokens_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists touch_push_tokens_updated_at_trigger on public.push_tokens;
create trigger touch_push_tokens_updated_at_trigger
before update on public.push_tokens
for each row execute function public.touch_push_tokens_updated_at();
