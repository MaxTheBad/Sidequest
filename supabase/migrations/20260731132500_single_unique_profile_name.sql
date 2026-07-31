-- Backfill the single public profile name from legacy display names and keep it unique.

do $$
declare
  profile_row record;
  base_name text;
  candidate_name text;
  collision_number integer;
begin
  for profile_row in
    select id, display_name
    from public.profiles
    where username is null or btrim(username) = ''
    order by created_at nulls last, id
  loop
    base_name := regexp_replace(lower(coalesce(profile_row.display_name, 'user')), '[^a-z0-9]+', '_', 'g');
    base_name := regexp_replace(base_name, '^_+|_+$', '', 'g');

    if length(base_name) < 3 then
      base_name := 'user_' || left(replace(profile_row.id::text, '-', ''), 8);
    end if;

    base_name := left(base_name, 30);
    candidate_name := base_name;
    collision_number := 2;

    while exists (
      select 1
      from public.profiles existing_profile
      where existing_profile.id <> profile_row.id
        and lower(existing_profile.username) = candidate_name
    ) loop
      candidate_name := left(base_name, 29 - length(collision_number::text)) || '_' || collision_number::text;
      collision_number := collision_number + 1;
    end loop;

    update public.profiles
    set username = candidate_name
    where id = profile_row.id;
  end loop;
end;
$$;

-- The product now presents one public identity instead of separate display and user names.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'enforce_profile_display_name_trigger'
      and not tgisinternal
  ) then
    alter table public.profiles disable trigger enforce_profile_display_name_trigger;
  end if;
end;
$$;

update public.profiles
set display_name = username
where username is not null
  and display_name is distinct from username;

do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'enforce_profile_display_name_trigger'
      and not tgisinternal
  ) then
    alter table public.profiles enable trigger enforce_profile_display_name_trigger;
  end if;
end;
$$;
