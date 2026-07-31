-- Server-enforced anti-spam limits for every client, including direct Supabase writes.

create index if not exists messages_sender_created_at_idx
  on public.messages (sender_id, created_at desc);

create index if not exists quests_creator_created_at_idx
  on public.quests (creator_id, created_at desc);

create or replace function public.enforce_message_abuse_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_body text := lower(regexp_replace(btrim(coalesce(new.body, '')), '\s+', ' ', 'g'));
  recent_count integer;
begin
  if new.sender_id is null or char_length(btrim(coalesce(new.body, ''))) = 0 then
    raise exception 'Message cannot be empty.';
  end if;

  -- Serialize each sender's inserts so parallel requests cannot bypass count limits.
  perform pg_advisory_xact_lock(hashtextextended('message:' || new.sender_id::text, 0));

  if char_length(new.body) > 1000 then
    raise exception 'Message is too long. Keep it under 1,000 characters.';
  end if;

  if (select count(*) from regexp_matches(new.body, 'https?://', 'gi')) > 2 then
    raise exception 'Messages can contain at most 2 links.';
  end if;

  if exists (
    select 1
    from public.messages existing
    where existing.sender_id = new.sender_id
      and existing.quest_id = new.quest_id
      and existing.created_at >= now() - interval '60 seconds'
      and lower(regexp_replace(btrim(existing.body), '\s+', ' ', 'g')) = normalized_body
  ) then
    raise exception 'That message was already sent. Please wait before sending it again.';
  end if;

  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 minute';
  if recent_count >= 8 then
    raise exception 'Too many messages. Please wait a minute and try again.';
  end if;

  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 hour';
  if recent_count >= 60 then
    raise exception 'Hourly message limit reached. Please try again later.';
  end if;

  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '24 hours';
  if recent_count >= 250 then
    raise exception 'Daily message limit reached. Please try again tomorrow.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_message_rate_limit on public.messages;
drop trigger if exists messages_enforce_abuse_limits on public.messages;
create trigger messages_enforce_abuse_limits
before insert on public.messages
for each row execute function public.enforce_message_abuse_limits();

create or replace function public.quest_media_items_are_valid(items jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(coalesce(items, '[]'::jsonb)) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(coalesce(items, '[]'::jsonb)) > 3 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'object'
      or item->>'type' not in ('image', 'video')
      or nullif(btrim(item->>'url'), '') is null
  );
end;
$$;

alter table public.quests
  drop constraint if exists quests_media_items_limit;
alter table public.quests
  add constraint quests_media_items_limit
  check (public.quest_media_items_are_valid(media_items)) not valid;

create or replace function public.enforce_quest_abuse_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  normalized_title text := lower(regexp_replace(btrim(coalesce(new.title, '')), '\s+', ' ', 'g'));
begin
  if not public.quest_media_items_are_valid(new.media_items) then
    raise exception 'A quest can have at most 3 valid media items.';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quest:' || new.creator_id::text, 0));

  if char_length(btrim(coalesce(new.title, ''))) < 3 or char_length(new.title) > 120 then
    raise exception 'Quest title must be between 3 and 120 characters.';
  end if;

  if char_length(coalesce(new.description, '')) > 3000 then
    raise exception 'Quest description is too long.';
  end if;

  if exists (
    select 1
    from public.quests existing
    where existing.creator_id = new.creator_id
      and existing.created_at >= now() - interval '24 hours'
      and lower(regexp_replace(btrim(existing.title), '\s+', ' ', 'g')) = normalized_title
  ) then
    raise exception 'You already posted a quest with this title recently.';
  end if;

  select count(*) into recent_count
  from public.quests
  where creator_id = new.creator_id
    and created_at >= now() - interval '5 minutes';
  if recent_count >= 1 then
    raise exception 'Please wait 5 minutes before creating another quest.';
  end if;

  select count(*) into recent_count
  from public.quests
  where creator_id = new.creator_id
    and created_at >= now() - interval '1 hour';
  if recent_count >= 5 then
    raise exception 'Hourly quest limit reached. Please try again later.';
  end if;

  select count(*) into recent_count
  from public.quests
  where creator_id = new.creator_id
    and created_at >= now() - interval '24 hours';
  if recent_count >= 15 then
    raise exception 'Daily quest limit reached. Please try again tomorrow.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listing_rate_limit on public.quests;
drop trigger if exists quests_enforce_abuse_limits on public.quests;
create trigger quests_enforce_abuse_limits
before insert or update of media_items on public.quests
for each row execute function public.enforce_quest_abuse_limits();

create or replace function public.enforce_report_abuse_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  -- Block-generated reports have their own trusted path and are not user submissions.
  if new.reason_code = 'user_blocked' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('report:' || new.reporter_id::text, 0));

  if char_length(coalesce(new.details, '')) > 2000 then
    raise exception 'Report details are too long.';
  end if;

  if jsonb_typeof(coalesce(new.evidence_urls, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(new.evidence_urls, '[]'::jsonb)) > 3 then
    raise exception 'A report can include at most 3 evidence items.';
  end if;

  if exists (
    select 1
    from public.reports existing
    where existing.reporter_id = new.reporter_id
      and existing.created_at >= now() - interval '24 hours'
      and existing.context_type = new.context_type
      and existing.reported_user_id is not distinct from new.reported_user_id
      and existing.quest_id is not distinct from new.quest_id
      and existing.message_id is not distinct from new.message_id
      and existing.reason_code = new.reason_code
  ) then
    raise exception 'You already reported this content. Our moderation team has it.';
  end if;

  select count(*) into recent_count
  from public.reports
  where reporter_id = new.reporter_id
    and reason_code <> 'user_blocked'
    and created_at >= now() - interval '10 minutes';
  if recent_count >= 3 then
    raise exception 'Too many reports. Please wait before submitting another.';
  end if;

  select count(*) into recent_count
  from public.reports
  where reporter_id = new.reporter_id
    and reason_code <> 'user_blocked'
    and created_at >= now() - interval '24 hours';
  if recent_count >= 10 then
    raise exception 'Daily report limit reached. Contact support for urgent safety issues.';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_enforce_abuse_limits on public.reports;
create trigger reports_enforce_abuse_limits
before insert on public.reports
for each row execute function public.enforce_report_abuse_limits();

-- Only the trusted block trigger may create the reserved user_blocked report type.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
for insert to authenticated
with check (
  reporter_id = auth.uid()
  and reason_code <> 'user_blocked'
);

create or replace function public.can_upload_quest_media(
  object_bucket text,
  object_name text,
  object_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  actor_id text := auth.uid()::text;
  object_size bigint;
  mime_type text := lower(coalesce(object_metadata->>'mimetype', ''));
  recent_count integer;
begin
  if actor_id is null or split_part(object_name, '/', 1) <> actor_id then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quest-media:' || actor_id, 0));

  if coalesce(object_metadata->>'size', '') !~ '^\d+$' then
    return false;
  end if;
  object_size := (object_metadata->>'size')::bigint;

  if object_size <= 0 or object_size > 62914560 then
    return false;
  end if;

  if object_bucket = 'quest-videos' and mime_type not in ('video/mp4', 'video/quicktime', 'video/x-m4v') then
    return false;
  end if;
  if object_bucket = 'quest-media' and mime_type not in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/x-m4v'
  ) then
    return false;
  end if;

  select count(*) into recent_count
  from storage.objects existing
  where existing.bucket_id in ('quest-media', 'quest-videos')
    and split_part(existing.name, '/', 1) = actor_id
    and existing.created_at >= now() - interval '1 hour';
  if recent_count >= 12 then
    return false;
  end if;

  select count(*) into recent_count
  from storage.objects existing
  where existing.bucket_id in ('quest-media', 'quest-videos')
    and split_part(existing.name, '/', 1) = actor_id
    and existing.created_at >= now() - interval '24 hours';
  return recent_count < 40;
end;
$$;

revoke all on function public.can_upload_quest_media(text, text, jsonb) from public;
grant execute on function public.can_upload_quest_media(text, text, jsonb) to authenticated, service_role;

update storage.buckets
set file_size_limit = 62914560,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/x-m4v'
    ]
where id = 'quest-media';

update storage.buckets
set file_size_limit = 62914560,
    allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/x-m4v']
where id = 'quest-videos';

drop policy if exists "users upload own quest media" on storage.objects;
drop policy if exists quest_media_upload_guarded on storage.objects;
create policy quest_media_upload_guarded
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quest-media'
  and public.can_upload_quest_media(bucket_id, name, metadata)
);

drop policy if exists "users update own quest media" on storage.objects;
drop policy if exists quest_media_update_guarded on storage.objects;
create policy quest_media_update_guarded
on storage.objects for update to authenticated
using (
  bucket_id = 'quest-media'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'quest-media'
  and public.can_upload_quest_media(bucket_id, name, metadata)
);

drop policy if exists "users upload own quest video" on storage.objects;
drop policy if exists quest_video_upload_guarded on storage.objects;
create policy quest_video_upload_guarded
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quest-videos'
  and public.can_upload_quest_media(bucket_id, name, metadata)
);

drop policy if exists "users update own quest video" on storage.objects;
drop policy if exists quest_video_update_guarded on storage.objects;
create policy quest_video_update_guarded
on storage.objects for update to authenticated
using (
  bucket_id = 'quest-videos'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'quest-videos'
  and public.can_upload_quest_media(bucket_id, name, metadata)
);
