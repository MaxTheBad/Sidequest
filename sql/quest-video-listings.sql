-- Quest listing video support (optional live/upload badge)

alter table public.quests
  add column if not exists media_video_url text,
  add column if not exists media_source text;

alter table public.quests
  drop constraint if exists quests_media_source_check;

alter table public.quests
  add constraint quests_media_source_check
  check (media_source is null or media_source in ('live', 'upload'));

insert into storage.buckets (id, name, public)
values ('quest-videos', 'quest-videos', true)
on conflict (id) do nothing;

drop policy if exists "quest videos public read" on storage.objects;
create policy "quest videos public read"
on storage.objects for select
using (bucket_id = 'quest-videos');

drop policy if exists "users upload own quest video" on storage.objects;
create policy "users upload own quest video"
on storage.objects for insert
with check (
  bucket_id = 'quest-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users update own quest video" on storage.objects;
create policy "users update own quest video"
on storage.objects for update
using (
  bucket_id = 'quest-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'quest-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users delete own quest video" on storage.objects;
create policy "users delete own quest video"
on storage.objects for delete
using (
  bucket_id = 'quest-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
