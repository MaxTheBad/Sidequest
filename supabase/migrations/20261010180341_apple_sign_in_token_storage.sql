create table public.apple_sign_in_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  apple_subject text not null check (char_length(apple_subject) between 1 and 255),
  client_id text not null check (char_length(client_id) between 3 and 255),
  token_ciphertext text,
  token_nonce text,
  key_version smallint not null default 1 check (key_version > 0),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint apple_sign_in_tokens_material_matches_status check (
    (status = 'active' and token_ciphertext is not null and token_nonce is not null and revoked_at is null)
    or
    (status = 'revoked' and token_ciphertext is null and token_nonce is null and revoked_at is not null)
  )
);

comment on table public.apple_sign_in_tokens is
  'Server-only encrypted Sign in with Apple refresh tokens used exclusively for account-deletion revocation.';
comment on column public.apple_sign_in_tokens.token_ciphertext is
  'AES-256-GCM ciphertext. The encryption key is stored only as an Edge Function secret.';
comment on column public.apple_sign_in_tokens.token_nonce is
  'Unique 96-bit AES-GCM nonce encoded as base64url.';

alter table public.apple_sign_in_tokens enable row level security;

revoke all on table public.apple_sign_in_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_sign_in_tokens to service_role;
