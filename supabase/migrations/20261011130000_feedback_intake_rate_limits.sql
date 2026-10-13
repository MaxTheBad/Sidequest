-- Unapplied durable feedback-intake state for serverless routes. The route must
-- call this RPC after deployment; process memory is not an abuse control.
create table if not exists public.app_feedback_intake (
  user_id uuid not null references public.profiles(id) on delete cascade,
  fingerprint text not null,
  reservation_id uuid not null default gen_random_uuid(),
  delivery_state text not null default 'reserved' check (delivery_state in ('reserved', 'delivered')),
  submitted_at timestamptz not null default now(),
  primary key (user_id, fingerprint)
);
alter table public.app_feedback_intake enable row level security;
revoke all on public.app_feedback_intake from public, anon, authenticated;

drop function if exists public.reserve_app_feedback_intake(text);
drop function if exists public.finalize_app_feedback_intake(uuid, boolean);

create or replace function public.reserve_app_feedback_intake_server(
  p_user_id uuid,
  p_fingerprint text,
  p_captcha_verified boolean default false
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare recent_count integer; reservation uuid := gen_random_uuid();
begin
  if coalesce((coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'User required.'; end if;
  if char_length(coalesce(p_fingerprint, '')) < 32 or char_length(p_fingerprint) > 128 then raise exception 'Invalid feedback fingerprint.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || p_user_id::text, 0));
  delete from public.app_feedback_intake where user_id = p_user_id and delivery_state = 'reserved' and submitted_at < now() - interval '15 minutes';
  if exists (select 1 from public.app_feedback_intake where user_id = p_user_id and fingerprint = p_fingerprint and submitted_at >= now() - interval '24 hours') then return jsonb_build_object('accepted', false, 'reason', 'duplicate'); end if;
  select count(*) into recent_count from public.app_feedback_intake where user_id = p_user_id and submitted_at >= now() - interval '10 minutes';
  if recent_count >= 10 then return jsonb_build_object('accepted', false, 'reason', 'rate_limited'); end if;
  if recent_count >= 3 and not coalesce(p_captcha_verified, false) then return jsonb_build_object('accepted', false, 'reason', 'captcha_required'); end if;
  insert into public.app_feedback_intake(user_id, fingerprint, reservation_id) values (p_user_id, p_fingerprint, reservation)
  on conflict (user_id, fingerprint) do update set reservation_id = excluded.reservation_id, delivery_state = 'reserved', submitted_at = excluded.submitted_at;
  return jsonb_build_object('accepted', true, 'reservation_id', reservation);
end; $$;

create or replace function public.finalize_app_feedback_intake_server(
  p_user_id uuid,
  p_reservation_id uuid,
  p_delivered boolean
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if coalesce((coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'User required.'; end if;
  if p_delivered then
    update public.app_feedback_intake set delivery_state = 'delivered'
      where user_id = p_user_id and reservation_id = p_reservation_id and delivery_state = 'reserved';
  else
    delete from public.app_feedback_intake
      where user_id = p_user_id and reservation_id = p_reservation_id and delivery_state = 'reserved';
  end if;
  get diagnostics affected = row_count;
  return affected = 1;
end; $$;
revoke all on function public.reserve_app_feedback_intake_server(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.reserve_app_feedback_intake_server(uuid, text, boolean) to service_role;
revoke all on function public.finalize_app_feedback_intake_server(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.finalize_app_feedback_intake_server(uuid, uuid, boolean) to service_role;
comment on table public.app_feedback_intake is 'Delete with account deletion cascade. Stores only opaque fingerprints and timestamps for durable duplicate/rate limiting.';
