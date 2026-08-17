create table if not exists public.facebook_data_deletion_requests (
  confirmation_code uuid primary key,
  facebook_user_id_hash text not null,
  questhat_user_id uuid null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  cleanup_warnings text[] not null default '{}',
  error_message text null
);

alter table public.facebook_data_deletion_requests enable row level security;

revoke all on public.facebook_data_deletion_requests from anon, authenticated;

create index if not exists facebook_data_deletion_requests_requested_at_idx
  on public.facebook_data_deletion_requests (requested_at desc);

comment on table public.facebook_data_deletion_requests is
  'Server-only status records for signed Meta/Facebook data-deletion callbacks. Facebook identifiers are salted hashes.';
