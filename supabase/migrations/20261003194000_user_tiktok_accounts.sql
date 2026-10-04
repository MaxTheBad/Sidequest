create table if not exists public.user_tiktok_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tiktok_open_id text not null,
  tiktok_union_id text,
  display_name text,
  avatar_url text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (tiktok_open_id)
);

alter table public.user_tiktok_accounts enable row level security;

drop policy if exists "No direct client access to TikTok tokens" on public.user_tiktok_accounts;
create policy "No direct client access to TikTok tokens"
on public.user_tiktok_accounts
for all
using (false)
with check (false);

create index if not exists user_tiktok_accounts_user_id_idx on public.user_tiktok_accounts(user_id);
