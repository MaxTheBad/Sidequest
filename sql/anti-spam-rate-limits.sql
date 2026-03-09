-- Anti-spam safeguards for messages + listings
-- Run in Supabase SQL editor.

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  sent_last_minute int;
begin
  select count(*) into sent_last_minute
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 minute';

  if sent_last_minute >= 6 then
    raise exception 'Rate limit exceeded: max 6 messages per minute';
  end if;

  if char_length(coalesce(new.body, '')) > 500 then
    raise exception 'Message too long: max 500 characters';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_message_rate_limit on public.messages;
create trigger trg_message_rate_limit
before insert on public.messages
for each row
execute function public.enforce_message_rate_limit();

create or replace function public.enforce_listing_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  created_last_hour int;
begin
  select count(*) into created_last_hour
  from public.quests
  where creator_id = new.creator_id
    and created_at >= now() - interval '1 hour';

  if created_last_hour >= 5 then
    raise exception 'Rate limit exceeded: max 5 listings per hour';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listing_rate_limit on public.quests;
create trigger trg_listing_rate_limit
before insert on public.quests
for each row
execute function public.enforce_listing_rate_limit();
