-- Security/audit logging v1
-- Records account, abuse-prevention, and media activity with request metadata
-- captured by server routes. Raw IP values are intended for short retention.

create extension if not exists pgcrypto;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null references public.profiles(id) on delete set null,
  event_type text not null,
  raw_ip inet null,
  ip_hash text null,
  user_agent text null,
  device_label text null,
  cf_ray text null,
  cf_ipcountry text null,
  turnstile_success boolean null,
  metadata jsonb not null default '{}'::jsonb,
  constraint security_events_event_type_check check (
    event_type in (
      'signup_password_submitted',
      'oauth_started',
      'login_password_success',
      'turnstile_verified',
      'media_uploaded',
      'quest_created',
      'quest_updated',
      'report_submitted',
      'message_sent'
    )
  )
);

create index if not exists security_events_user_created_idx
  on public.security_events (user_id, created_at desc);

create index if not exists security_events_type_created_idx
  on public.security_events (event_type, created_at desc);

create index if not exists security_events_ip_hash_created_idx
  on public.security_events (ip_hash, created_at desc)
  where ip_hash is not null;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid null references public.quests(id) on delete set null,
  bucket_id text not null,
  object_path text not null,
  public_url text null,
  media_type text not null check (media_type in ('image', 'video', 'other')),
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  source_context text not null check (source_context in ('profile_photo', 'profile_photo_original', 'quest_media', 'quest_media_thumbnail', 'quest_video', 'onboarding_photo')),
  raw_ip inet null,
  ip_hash text null,
  user_agent text null,
  cf_ray text null,
  cf_ipcountry text null,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz null
);

create unique index if not exists media_assets_bucket_path_idx
  on public.media_assets (bucket_id, object_path);

create index if not exists media_assets_user_created_idx
  on public.media_assets (user_id, created_at desc);

create index if not exists media_assets_quest_created_idx
  on public.media_assets (quest_id, created_at desc)
  where quest_id is not null;

alter table public.security_events enable row level security;
alter table public.media_assets enable row level security;

revoke all on table public.security_events from anon;
revoke all on table public.media_assets from anon;

grant select on table public.security_events to authenticated;
grant select, update on table public.media_assets to authenticated;
grant insert, select, update, delete on table public.security_events to service_role;
grant insert, select, update, delete on table public.media_assets to service_role;

drop policy if exists security_events_select_moderators on public.security_events;
create policy security_events_select_moderators
on public.security_events for select
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

drop policy if exists media_assets_select_own on public.media_assets;
create policy media_assets_select_own
on public.media_assets for select
to authenticated
using (user_id = auth.uid());

drop policy if exists media_assets_select_moderators on public.media_assets;
create policy media_assets_select_moderators
on public.media_assets for select
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));

drop policy if exists media_assets_update_moderators on public.media_assets;
create policy media_assets_update_moderators
on public.media_assets for update
to authenticated
using (public.current_profile_role() in ('moderator', 'admin', 'super_admin'))
with check (public.current_profile_role() in ('moderator', 'admin', 'super_admin'));
