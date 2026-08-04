create table if not exists public.live_activity_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  environment text not null check (environment in ('production', 'sandbox')),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_activity_push_token_format check (token ~ '^[0-9a-f]{64,512}$')
);

create index if not exists live_activity_push_tokens_user_active_idx
  on public.live_activity_push_tokens (user_id, active, updated_at desc);

alter table public.live_activity_push_tokens enable row level security;
revoke all on table public.live_activity_push_tokens from public, anon, authenticated;

create or replace function public.register_live_activity_push_token(
  p_token text,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid := auth.uid();
  clean_token text := lower(btrim(coalesce(p_token, '')));
begin
  if account_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if clean_token !~ '^[0-9a-f]{64,512}$' then
    raise exception using errcode = '22023', message = 'Invalid Live Activity token.';
  end if;
  if p_environment not in ('production', 'sandbox') then
    raise exception using errcode = '22023', message = 'Invalid APNs environment.';
  end if;

  insert into public.live_activity_push_tokens (
    user_id, token, environment, active, last_seen_at, last_error, updated_at
  ) values (
    account_id, clean_token, p_environment, true, now(), null, now()
  )
  on conflict (token) do update
  set user_id = excluded.user_id,
      environment = excluded.environment,
      active = true,
      last_seen_at = now(),
      last_error = null,
      updated_at = now();

  -- Keep a bounded number of devices per account without breaking multi-device use.
  update public.live_activity_push_tokens target
  set active = false, updated_at = now()
  where target.id in (
    select ranked.id
    from (
      select id, row_number() over (order by last_seen_at desc) as position
      from public.live_activity_push_tokens
      where user_id = account_id and active
    ) ranked
    where ranked.position > 10
  );

  return true;
end;
$$;

create or replace function public.deactivate_live_activity_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  update public.live_activity_push_tokens
  set active = false, updated_at = now()
  where user_id = account_id
    and token = lower(btrim(coalesce(p_token, '')));
  return found;
end;
$$;

revoke all on function public.register_live_activity_push_token(text, text) from public, anon;
revoke all on function public.deactivate_live_activity_push_token(text) from public, anon;
grant execute on function public.register_live_activity_push_token(text, text) to authenticated;
grant execute on function public.deactivate_live_activity_push_token(text) to authenticated;

create or replace function public.deactivate_live_activity_tokens_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deactivated_at is not null
     or coalesce(new.moderation_status, 'active') <> 'active' then
    update public.live_activity_push_tokens
    set active = false, updated_at = now()
    where user_id = new.id and active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deactivate_live_activity_tokens on public.profiles;
create trigger trg_deactivate_live_activity_tokens
after update of deactivated_at, moderation_status on public.profiles
for each row execute function public.deactivate_live_activity_tokens_for_profile();
