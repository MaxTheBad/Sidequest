insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = split_part(name, '/', 1)
);
