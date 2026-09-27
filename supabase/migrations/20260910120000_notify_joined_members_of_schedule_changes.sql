create or replace function public.notify_joined_members_of_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
begin
  if new.starts_at is not distinct from old.starts_at then
    return new;
  end if;

  -- A moved quest needs a fresh upcoming reminder at its new time.
  new.start_reminder_sent_at := null;

  for recipient in
    select distinct member.user_id
    from public.quest_members member
    where member.quest_id = new.id
      and member.status = 'approved'
      and member.user_id <> new.creator_id
  loop
    perform public.create_notification(
      recipient.user_id,
      'system',
      'Quest time changed',
      '"' || left(coalesce(new.title, 'Your quest'), 100) || '" has a new date or time. Open QuestHat for the updated schedule.',
      '/listing/' || new.id::text,
      new.id,
      new.creator_id,
      null,
      null,
      jsonb_build_object(
        'kind', 'quest_schedule_changed',
        'old_starts_at', old.starts_at,
        'starts_at', new.starts_at,
        'quest_title', new.title
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_joined_members_of_schedule_change on public.quests;
create trigger trg_notify_joined_members_of_schedule_change
before update of starts_at on public.quests
for each row execute function public.notify_joined_members_of_schedule_change();
