-- Public quest comments are broadcast content, so they use stricter limits than direct chat.

create or replace function public.enforce_message_abuse_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_body text := lower(regexp_replace(btrim(coalesce(new.body, '')), '\s+', ' ', 'g'));
  is_public_comment boolean := coalesce(new.body, '') like '[PUBLIC] %';
  recent_count integer;
begin
  if new.sender_id is null or char_length(btrim(coalesce(new.body, ''))) = 0 then
    raise exception 'Message cannot be empty.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('message:' || new.sender_id::text, 0));

  if char_length(new.body) > 1000 then
    raise exception 'Message is too long. Keep it under 1,000 characters.';
  end if;

  if (select count(*) from regexp_matches(new.body, 'https?://', 'gi')) > 2 then
    raise exception 'Messages can contain at most 2 links.';
  end if;

  if is_public_comment and exists (
    select 1
    from public.messages existing
    where existing.sender_id = new.sender_id
      and existing.body like '[PUBLIC] %'
      and existing.created_at >= now() - interval '4 seconds'
  ) then
    raise exception 'Please wait a few seconds before posting another comment.';
  end if;

  if exists (
    select 1
    from public.messages existing
    where existing.sender_id = new.sender_id
      and existing.quest_id = new.quest_id
      and existing.created_at >= now() - (case when is_public_comment then interval '10 minutes' else interval '60 seconds' end)
      and lower(regexp_replace(btrim(existing.body), '\s+', ' ', 'g')) = normalized_body
  ) then
    raise exception 'That message was already sent. Please wait before sending it again.';
  end if;

  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 minute'
    and (not is_public_comment or body like '[PUBLIC] %');
  if recent_count >= (case when is_public_comment then 3 else 8 end) then
    raise exception 'Too many messages. Please wait a minute and try again.';
  end if;

  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 hour'
    and (not is_public_comment or body like '[PUBLIC] %');
  if recent_count >= (case when is_public_comment then 20 else 60 end) then
    raise exception 'Hourly message limit reached. Please try again later.';
  end if;

  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '24 hours'
    and (not is_public_comment or body like '[PUBLIC] %');
  if recent_count >= (case when is_public_comment then 100 else 250 end) then
    raise exception 'Daily message limit reached. Please try again tomorrow.';
  end if;

  return new;
end;
$$;
