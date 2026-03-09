-- Listing media gallery support (photos + videos with labels)

alter table public.quests
  add column if not exists media_items jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('quest-media', 'quest-media', true)
on conflict (id) do nothing;

drop policy if exists "quest media public read" on storage.objects;
create policy "quest media public read"
on storage.objects for select
using (bucket_id = 'quest-media');

drop policy if exists "users upload own quest media" on storage.objects;
create policy "users upload own quest media"
on storage.objects for insert
with check (
  bucket_id = 'quest-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users update own quest media" on storage.objects;
create policy "users update own quest media"
on storage.objects for update
using (
  bucket_id = 'quest-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'quest-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users delete own quest media" on storage.objects;
create policy "users delete own quest media"
on storage.objects for delete
using (
  bucket_id = 'quest-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);
