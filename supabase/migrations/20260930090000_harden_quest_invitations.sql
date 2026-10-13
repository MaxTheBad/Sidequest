-- Invitations are valid only for an open, upcoming quest. Keep this check in
-- the database so stale clients cannot invite someone to an ended plan.
create or replace function public.send_quest_invitation(
  p_quest_id uuid,
  p_recipient_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  invitation_id uuid;
  quest_title text;
  sender_name text;
begin
  if caller_id is null then raise exception 'Authentication required.'; end if;
  if caller_id = p_recipient_id then raise exception 'You cannot invite yourself.'; end if;
  if char_length(coalesce(p_message, '')) > 500 then raise exception 'Invitation message is too long.'; end if;

  select q.title into quest_title
  from public.quests q
  where q.id = p_quest_id
    and q.creator_id = caller_id
    and q.status = 'open'
    and (q.starts_at is null or q.starts_at > now());
  if quest_title is null then raise exception 'Only the host can invite people to an active quest.'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_recipient_id and p.people_discovery_enabled and p.deactivated_at is null
  ) then raise exception 'This person is not available for invitations.'; end if;

  if exists (
    select 1 from public.quest_members m
    where m.quest_id = p_quest_id and m.user_id = p_recipient_id and m.status = 'approved'
  ) then raise exception 'This person has already joined the quest.'; end if;

  insert into public.quest_invitations (quest_id, sender_id, recipient_id, message)
  values (p_quest_id, caller_id, p_recipient_id, nullif(trim(coalesce(p_message, '')), ''))
  returning id into invitation_id;

  select coalesce(p.display_name, p.username, 'A host') into sender_name
  from public.profiles p where p.id = caller_id;

  perform public.create_notification(
    p_recipient_id,
    'system',
    coalesce(sender_name, 'A host') || ' invited you',
    'Join "' || left(coalesce(quest_title, 'a quest'), 120) || '"' || case when nullif(trim(coalesce(p_message, '')), '') is null then '.' else ': ' || left(trim(p_message), 180) end,
    '/listing/' || p_quest_id::text,
    p_quest_id,
    caller_id,
    null,
    p_recipient_id,
    jsonb_build_object('kind', 'quest_invitation', 'invitation_id', invitation_id)
  );

  return invitation_id;
end;
$$;

-- If a guest joins from the listing rather than the invitation button, resolve
-- the corresponding pending invitation so it does not remain in Inbox.
create or replace function public.resolve_quest_invitations_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update public.quest_invitations
    set status = 'accepted', responded_at = coalesce(responded_at, now())
    where quest_id = new.quest_id
      and recipient_id = new.user_id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists resolve_quest_invitations_on_join on public.quest_members;
create trigger resolve_quest_invitations_on_join
after insert or update of status on public.quest_members
for each row execute function public.resolve_quest_invitations_on_join();

-- Clean up invitations already superseded by an approved membership.
update public.quest_invitations i
set status = 'accepted', responded_at = coalesce(i.responded_at, now())
from public.quest_members m
where i.quest_id = m.quest_id
  and i.recipient_id = m.user_id
  and i.status = 'pending'
  and m.status = 'approved';
