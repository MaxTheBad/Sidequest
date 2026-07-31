create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages boolean not null default true,
  comments boolean not null default true,
  join_updates boolean not null default true,
  join_requests boolean not null default true,
  friend_requests boolean not null default true,
  followed_posts boolean not null default false,
  liked_categories boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.notify_friend_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_name text;
begin
  if new.status <> 'pending' or new.requester_id = new.addressee_id then
    return new;
  end if;

  select coalesce(display_name, username, 'Someone')
  into requester_name
  from public.profiles
  where id = new.requester_id;

  perform public.create_notification(
    new.addressee_id,
    'system',
    'New friend request',
    coalesce(requester_name, 'Someone') || ' wants to connect with you.',
    '/profile/' || new.requester_id::text,
    null,
    new.requester_id,
    null,
    null,
    jsonb_build_object('kind', 'friend_request')
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_friend_request_insert on public.friends;
create trigger trg_notify_friend_request_insert
after insert on public.friends
for each row execute function public.notify_friend_request_insert();

create or replace function public.notify_quest_discovery_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator_name text;
  category_name text;
  recipient record;
begin
  select coalesce(display_name, username, 'Someone')
  into creator_name
  from public.profiles
  where id = new.creator_id;

  select coalesce(nullif(trim(name), ''), nullif(trim(category), ''), 'a category you like')
  into category_name
  from public.hobbies
  where id = new.hobby_id;

  for recipient in
    with candidates as (
      select
        case
          when f.requester_id = new.creator_id then f.addressee_id
          else f.requester_id
        end as user_id,
        'followed_post'::text as source_kind,
        1 as priority
      from public.friends f
      left join public.notification_preferences p on p.user_id = case
        when f.requester_id = new.creator_id then f.addressee_id
        else f.requester_id
      end
      where f.status = 'accepted'
        and (f.requester_id = new.creator_id or f.addressee_id = new.creator_id)
        and coalesce(p.followed_posts, false)

      union all

      select
        uh.user_id,
        'liked_category'::text as source_kind,
        2 as priority
      from public.user_hobbies uh
      left join public.notification_preferences p on p.user_id = uh.user_id
      where uh.hobby_id = new.hobby_id
        and coalesce(p.liked_categories, false)
    )
    select distinct on (user_id) user_id, source_kind
    from candidates
    where user_id <> new.creator_id
    order by user_id, priority
  loop
    perform public.create_notification(
      recipient.user_id,
      'system',
      case
        when recipient.source_kind = 'followed_post'
          then coalesce(creator_name, 'Someone') || ' posted a new quest'
        else 'New ' || coalesce(category_name, 'interest') || ' quest'
      end,
      '"' || left(coalesce(new.title, 'New quest'), 120) || '"',
      '/listing/' || new.id::text,
      new.id,
      new.creator_id,
      null,
      null,
      jsonb_build_object(
        'kind', recipient.source_kind,
        'quest_title', new.title,
        'category', category_name
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_quest_discovery_insert on public.quests;
create trigger trg_notify_quest_discovery_insert
after insert on public.quests
for each row execute function public.notify_quest_discovery_insert();
