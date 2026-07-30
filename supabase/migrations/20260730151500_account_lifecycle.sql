-- Reversible deactivation and permanent account deletion support.

alter table public.profiles
  add column if not exists deactivated_at timestamptz null;

create index if not exists profiles_deactivated_at_idx
  on public.profiles (deactivated_at)
  where deactivated_at is not null;

create or replace function public.deactivate_my_account()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid := auth.uid();
  deactivated_time timestamptz := now();
  changed_rows integer := 0;
begin
  if account_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  update public.profiles
  set deactivated_at = coalesce(deactivated_at, deactivated_time),
      updated_at = now()
  where id = account_id
  returning deactivated_at into deactivated_time;

  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception using errcode = 'P0002', message = 'Profile not found.';
  end if;

  update public.push_tokens
  set active = false,
      updated_at = now()
  where user_id = account_id;

  return deactivated_time;
end;
$$;

create or replace function public.reactivate_my_account()
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

  update public.profiles
  set deactivated_at = null,
      updated_at = now()
  where id = account_id;

  return found;
end;
$$;

revoke all on function public.deactivate_my_account() from public, anon;
revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.reactivate_my_account() to authenticated;

-- A deactivated profile remains visible to its owner so the app can offer
-- restoration, but is hidden from everyone else.
drop policy if exists "profiles are viewable by everyone" on public.profiles;
drop policy if exists profiles_visible_accounts on public.profiles;
create policy profiles_visible_accounts
on public.profiles for select
using (
  deactivated_at is null
  or id = auth.uid()
  or public.current_profile_role() in ('moderator', 'admin', 'super_admin')
);

-- Hosted listings disappear while the account is deactivated and return when
-- the owner restores the account.
drop policy if exists "quests readable" on public.quests;
drop policy if exists quests_visible_active_creators on public.quests;
create policy quests_visible_active_creators
on public.quests for select
using (
  creator_id = auth.uid()
  or public.current_profile_role() in ('moderator', 'admin', 'super_admin')
  or exists (
    select 1
    from public.profiles creator
    where creator.id = quests.creator_id
      and creator.deactivated_at is null
  )
);

-- Remove deactivated accounts from public guest lists and member counts. Quest
-- managers and the account owner can still see the row for administrative and
-- restoration purposes.
drop policy if exists "members readable" on public.quest_members;
drop policy if exists members_visible_active_accounts on public.quest_members;
create policy members_visible_active_accounts
on public.quest_members for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.quests quest
    where quest.id = quest_members.quest_id
      and quest.creator_id = auth.uid()
  )
  or public.current_profile_role() in ('moderator', 'admin', 'super_admin')
  or exists (
    select 1 from public.profiles member_profile
    where member_profile.id = quest_members.user_id
      and member_profile.deactivated_at is null
  )
);
