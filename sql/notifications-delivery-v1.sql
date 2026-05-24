-- Delivered notifications + triggers for messages and membership changes

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('message','join_request','approval','declined','system')),
  title text not null,
  body text not null,
  href text not null,
  quest_id uuid references public.quests(id) on delete cascade,
  source_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete cascade,
  membership_user_id uuid references public.profiles(id) on delete cascade,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_read_idx on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
on public.notifications for select
using (auth.uid() = user_id);

drop policy if exists "users manage own notifications" on public.notifications;
create policy "users manage own notifications"
on public.notifications for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.create_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_quest_id uuid default null,
  p_source_user_id uuid default null,
  p_message_id uuid default null,
  p_membership_user_id uuid default null,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    href,
    quest_id,
    source_user_id,
    message_id,
    membership_user_id,
    meta
  )
  values (
    p_user_id,
    p_kind,
    p_title,
    p_body,
    p_href,
    p_quest_id,
    p_source_user_id,
    p_message_id,
    p_membership_user_id,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

create or replace function public.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_row public.quests%rowtype;
  sender_name text;
  recipient_id uuid;
  is_private boolean;
  clean_body text;
begin
  select * into quest_row from public.quests where id = new.quest_id;
  if quest_row.id is null then
    return new;
  end if;

  select coalesce(display_name, 'Someone') into sender_name
  from public.profiles
  where id = new.sender_id;

  is_private := new.body like '[PRIVATE%';
  clean_body := regexp_replace(new.body, '^\[(PUBLIC|PRIVATE)(?:\s+to=[0-9a-fA-F-]{36})?\]\s?', '', 'i');

  if is_private then
    recipient_id := coalesce(
      nullif((regexp_match(new.body, '^\[PRIVATE\s+to=([0-9a-fA-F-]{36})\]'))[1], '')::uuid,
      quest_row.creator_id
    );
  else
    recipient_id := quest_row.creator_id;
  end if;

  if recipient_id is not null and recipient_id <> new.sender_id then
    perform public.create_notification(
      recipient_id,
      'message',
      case when is_private then 'New private message' else 'New comment on your listing' end,
      case
        when is_private then sender_name || ' sent you a private message.'
        else sender_name || ' commented: ' || left(coalesce(clean_body, ''), 120)
      end,
      case
        when is_private then '/inbox?thread=' || new.quest_id::text || ':private:' || new.sender_id::text || '&message=' || new.id::text
        else '/listing/' || new.quest_id::text
      end,
      new.quest_id,
      new.sender_id,
      new.id,
      null,
      jsonb_build_object(
        'private', is_private,
        'quest_title', quest_row.title,
        'sender_name', sender_name
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_message_insert on public.messages;
create trigger trg_notify_message_insert
after insert on public.messages
for each row execute function public.notify_message_insert();

create or replace function public.notify_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_row public.quests%rowtype;
  member_name text;
  actor_id uuid;
  next_status text;
  previous_status text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select * into quest_row from public.quests where id = new.quest_id;
  if quest_row.id is null then
    return new;
  end if;

  previous_status := coalesce(old.status, '');
  next_status := coalesce(new.status, 'approved');
  actor_id := new.user_id;

  select coalesce(display_name, 'Someone') into member_name
  from public.profiles
  where id = new.user_id;

  if next_status = 'pending' and (tg_op = 'INSERT' or previous_status is distinct from next_status) then
    perform public.create_notification(
      quest_row.creator_id,
      'join_request',
      'New join request',
      member_name || ' requested to join "' || coalesce(quest_row.title, 'your listing') || '".',
      '/listing/' || new.quest_id::text,
      new.quest_id,
      new.user_id,
      null,
      new.user_id,
      jsonb_build_object('status', next_status, 'member_name', member_name)
    );
  end if;

  if next_status = 'approved' and previous_status is distinct from next_status then
    if new.user_id <> quest_row.creator_id then
      perform public.create_notification(
        new.user_id,
        'approval',
        'Join approved',
        'You are now part of "' || coalesce(quest_row.title, 'this listing') || '".',
        '/listing/' || new.quest_id::text,
        new.quest_id,
        quest_row.creator_id,
        null,
        new.user_id,
        jsonb_build_object('status', next_status)
      );
    end if;

    if tg_op = 'INSERT' and new.user_id <> quest_row.creator_id then
      perform public.create_notification(
        quest_row.creator_id,
        'approval',
        'Member joined',
        member_name || ' joined "' || coalesce(quest_row.title, 'your listing') || '".',
        '/listing/' || new.quest_id::text,
        new.quest_id,
        new.user_id,
        null,
        new.user_id,
        jsonb_build_object('status', next_status, 'member_name', member_name)
      );
    end if;
  end if;

  if next_status = 'declined' and previous_status is distinct from next_status and new.user_id <> quest_row.creator_id then
    perform public.create_notification(
      new.user_id,
      'declined',
      'Join request declined',
      'Your request for "' || coalesce(quest_row.title, 'this listing') || '" was declined.',
      '/listing/' || new.quest_id::text,
      new.quest_id,
      quest_row.creator_id,
      null,
      new.user_id,
      jsonb_build_object('status', next_status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_membership_change on public.quest_members;
create trigger trg_notify_membership_change
after insert or update of status on public.quest_members
for each row execute function public.notify_membership_change();
