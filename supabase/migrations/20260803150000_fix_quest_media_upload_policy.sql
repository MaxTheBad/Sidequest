-- Storage applies bucket MIME and file-size limits independently. Keep the RLS
-- guard compatible with binary uploads where object metadata is populated only
-- after the insert policy is evaluated.
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
  supplied_size text := coalesce(object_metadata->>'size', '');
  supplied_mime_type text := lower(coalesce(object_metadata->>'mimetype', ''));
  recent_count integer;
begin
  if actor_id is null
     or object_bucket not in ('quest-media', 'quest-videos')
     or split_part(object_name, '/', 1) <> actor_id then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quest-media:' || actor_id, 0));

  -- Validate metadata when Storage supplies it. The bucket itself enforces the
  -- same 60 MB limit and MIME allowlist when these fields are not yet present.
  if supplied_size <> '' then
    if supplied_size !~ '^\d+$'
       or supplied_size::bigint <= 0
       or supplied_size::bigint > 62914560 then
      return false;
    end if;
  end if;

  if supplied_mime_type <> '' then
    if object_bucket = 'quest-videos'
       and supplied_mime_type not in ('video/mp4', 'video/quicktime', 'video/x-m4v') then
      return false;
    end if;
    if object_bucket = 'quest-media'
       and supplied_mime_type not in (
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'video/mp4', 'video/quicktime', 'video/x-m4v'
       ) then
      return false;
    end if;
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
