-- Put useful content into the APNs-visible title and body. iOS can only show a
-- preview of text that the server actually includes in the notification.
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
  else
    recipient_id := quest_row.creator_id;
  end if;

  if recipient_id is not null and recipient_id <> new.sender_id then
    perform public.create_notification(
      recipient_id,
      'message',
      case
        when is_private then 'New message from ' || sender_name
        else 'New comment on "' || left(quest_title, 70) || '"'
      end,
      case
        when is_private then left(coalesce(nullif(clean_body, ''), 'Sent you a message.'), 180)
        else sender_name || ': ' || left(coalesce(nullif(clean_body, ''), 'Left a comment.'), 160)
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
        'quest_title', quest_title,
        'sender_name', sender_name
      )
    );
  end if;

  return new;
end;
$$;
