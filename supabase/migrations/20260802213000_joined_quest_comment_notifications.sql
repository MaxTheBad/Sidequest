alter table public.notification_preferences
  add column if not exists joined_comments boolean not null default false;

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
  recipient record;
  is_private boolean;
  clean_body text;
  quest_title text;
begin
  select * into quest_row from public.quests where id = new.quest_id;
  if quest_row.id is null then
    return new;
  end if;

  select coalesce(display_name, username, 'Someone') into sender_name
  from public.profiles
  where id = new.sender_id;

  is_private := new.body like '[PRIVATE%';
  clean_body := trim(regexp_replace(new.body, '^\[(PUBLIC|PRIVATE)(?:\s+to=[0-9a-fA-F-]{36})?\]\s?', '', 'i'));
  quest_title := coalesce(nullif(trim(quest_row.title), ''), 'this quest');

  if is_private then
    recipient_id := coalesce(
      nullif((regexp_match(new.body, '^\[PRIVATE\s+to=([0-9a-fA-F-]{36})\]'))[1], '')::uuid,
      quest_row.creator_id
    );

    if recipient_id is not null and recipient_id <> new.sender_id then
      perform public.create_notification(
        recipient_id,
        'message',
        'New message from ' || sender_name,
        left(coalesce(nullif(clean_body, ''), 'Sent you a message.'), 180),
        '/inbox?thread=' || new.quest_id::text || ':private:' || new.sender_id::text || '&message=' || new.id::text,
        new.quest_id,
        new.sender_id,
        new.id,
        null,
        jsonb_build_object('private', true, 'quest_title', quest_title, 'sender_name', sender_name)
      );
    end if;

    return new;
  end if;

  if quest_row.creator_id is not null and quest_row.creator_id <> new.sender_id then
    perform public.create_notification(
      quest_row.creator_id,
      'message',
      'New comment on "' || left(quest_title, 70) || '"',
      sender_name || ': ' || left(coalesce(nullif(clean_body, ''), 'Left a comment.'), 160),
      '/listing/' || new.quest_id::text,
      new.quest_id,
      new.sender_id,
      new.id,
      null,
      jsonb_build_object('private', false, 'comment_audience', 'host', 'quest_title', quest_title, 'sender_name', sender_name)
    );
  end if;

  for recipient in
    select distinct member.user_id
    from public.quest_members member
    where member.quest_id = new.quest_id
      and member.status = 'approved'
      and member.user_id <> new.sender_id
      and member.user_id <> quest_row.creator_id
  loop
    perform public.create_notification(
      recipient.user_id,
      'message',
      'New comment on "' || left(quest_title, 70) || '"',
      sender_name || ': ' || left(coalesce(nullif(clean_body, ''), 'Left a comment.'), 160),
      '/listing/' || new.quest_id::text,
      new.quest_id,
      new.sender_id,
      new.id,
      null,
      jsonb_build_object('private', false, 'comment_audience', 'joined', 'quest_title', quest_title, 'sender_name', sender_name)
    );
  end loop;

  return new;
end;
$$;
