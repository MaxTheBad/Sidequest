-- Securely assigns a device token to the currently signed-in account.
-- A token may belong to a previous account after logout/login on one device,
-- so a normal RLS-protected upsert cannot safely move it.

create or replace function public.register_push_token(
  p_expo_push_token text,
  p_platform text default 'ios'
)
returns public.push_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  registered_token public.push_tokens;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_expo_push_token), '') is null then
    raise exception 'Push token is required';
  end if;

  insert into public.push_tokens (
    user_id,
    expo_push_token,
    platform,
    active,
    last_seen_at,
    updated_at
  )
  values (
    current_user_id,
    trim(p_expo_push_token),
    coalesce(nullif(trim(p_platform), ''), 'ios'),
    true,
    now(),
    now()
  )
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      active = true,
      last_seen_at = now(),
      updated_at = now()
  returning * into registered_token;

  return registered_token;
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;
