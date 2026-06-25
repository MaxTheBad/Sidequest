-- Unique usernames with a server-enforced 24-hour change cooldown.

alter table public.profiles
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.enforce_profile_username()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  if new.username is null or btrim(new.username) = '' then
    new.username := null;
    return new;
  end if;

  normalized := lower(btrim(new.username));

  if normalized !~ '^[a-z0-9_]{3,30}$' then
    raise exception using
      errcode = '22023',
      message = 'Username must be 3-30 characters and use only letters, numbers, or underscores.';
  end if;

  new.username := normalized;

  if tg_op = 'INSERT' or old.username is null then
    new.username_changed_at := now();
  elsif lower(old.username) is distinct from normalized then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '24 hours' then
      raise exception using
        errcode = 'P0001',
        message = 'You can only change your username once every 24 hours.';
    end if;
    new.username_changed_at := now();
  else
    new.username_changed_at := old.username_changed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_username_trigger on public.profiles;
create trigger enforce_profile_username_trigger
before insert or update of username on public.profiles
for each row execute function public.enforce_profile_username();

