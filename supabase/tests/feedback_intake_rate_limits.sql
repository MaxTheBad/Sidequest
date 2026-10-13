-- Run only in a disposable PostgreSQL database after the feedback migration.
-- The companion script creates and destroys that database.
\set ON_ERROR_STOP on

create extension if not exists dblink;

do $$
begin
  if has_function_privilege('anon', 'public.reserve_app_feedback_intake_server(uuid,text,boolean)', 'execute') then
    raise exception 'anon must not execute the server reservation RPC';
  end if;
  if has_function_privilege('authenticated', 'public.reserve_app_feedback_intake_server(uuid,text,boolean)', 'execute') then
    raise exception 'authenticated must not execute the server reservation RPC';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_app_feedback_intake_server(uuid,text,boolean)', 'execute') then
    raise exception 'service_role must execute the server reservation RPC';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_app_feedback_intake_server(uuid,uuid,boolean)', 'execute') then
    raise exception 'authenticated must not execute the server finalization RPC';
  end if;
end;
$$;

-- Even a direct privileged invocation fails unless the trusted gateway JWT role
-- is present. A client-supplied CAPTCHA boolean alone is not authoritative.
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
do $$
begin
  begin
    perform public.reserve_app_feedback_intake_server(
      '00000000-0000-0000-0000-000000000001', md5('forged-client-bypass'), true
    );
    raise exception 'forged client bypass unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into public.profiles(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');

do $$
declare
  result jsonb;
  reservation uuid;
begin
  -- Three ordinary submissions are accepted and finalized.
  for i in 1..3 loop
    result := public.reserve_app_feedback_intake_server(
      '00000000-0000-0000-0000-000000000001', md5('ordinary-' || i), false
    );
    if result ->> 'accepted' <> 'true' then raise exception 'ordinary submission % was rejected: %', i, result; end if;
    reservation := (result ->> 'reservation_id')::uuid;
    if not public.finalize_app_feedback_intake_server('00000000-0000-0000-0000-000000000001', reservation, true) then
      raise exception 'ordinary submission % did not finalize', i;
    end if;
  end loop;

  -- Failed or absent verification cannot clear the challenge.
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000001', md5('challenge-recovery'), false
  );
  if result ->> 'reason' <> 'captcha_required' then raise exception 'failed challenge did not remain blocked: %', result; end if;

  -- A server-verified challenge recovers, but replaying the same feedback is
  -- still rejected by the durable fingerprint.
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000001', md5('challenge-recovery'), true
  );
  if result ->> 'accepted' <> 'true' then raise exception 'verified challenge did not recover: %', result; end if;
  reservation := (result ->> 'reservation_id')::uuid;
  perform public.finalize_app_feedback_intake_server('00000000-0000-0000-0000-000000000001', reservation, true);
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000001', md5('challenge-recovery'), true
  );
  if result ->> 'reason' <> 'duplicate' then raise exception 'durable replay was not rejected: %', result; end if;

  -- Failed delivery releases its reservation for a safe retry.
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000002', md5('delivery-retry'), false
  );
  reservation := (result ->> 'reservation_id')::uuid;
  if not public.finalize_app_feedback_intake_server('00000000-0000-0000-0000-000000000002', reservation, false) then
    raise exception 'failed delivery reservation was not released';
  end if;
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000002', md5('delivery-retry'), false
  );
  if result ->> 'accepted' <> 'true' then raise exception 'failed delivery was not retryable: %', result; end if;
  perform public.finalize_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000002', (result ->> 'reservation_id')::uuid, false
  );

  -- Expired reservations do not consume the active quota.
  insert into public.app_feedback_intake(user_id, fingerprint, delivery_state, submitted_at)
  values ('00000000-0000-0000-0000-000000000002', md5('expired-reservation'), 'reserved', now() - interval '16 minutes');
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000002', md5('after-expiry'), false
  );
  if result ->> 'accepted' <> 'true' then raise exception 'expired reservation was not cleaned up: %', result; end if;
  perform public.finalize_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000002', (result ->> 'reservation_id')::uuid, false
  );
end;
$$;

-- A verified challenge does not remove the hard ten-per-ten-minute ceiling.
do $$
declare result jsonb;
begin
  for i in 1..10 loop
    result := public.reserve_app_feedback_intake_server(
      '00000000-0000-0000-0000-000000000003', md5('hard-limit-' || i), true
    );
    if result ->> 'accepted' <> 'true' then raise exception 'hard-limit setup % failed: %', i, result; end if;
    perform public.finalize_app_feedback_intake_server(
      '00000000-0000-0000-0000-000000000003', (result ->> 'reservation_id')::uuid, true
    );
  end loop;
  result := public.reserve_app_feedback_intake_server(
    '00000000-0000-0000-0000-000000000003', md5('hard-limit-11'), true
  );
  if result ->> 'reason' <> 'rate_limited' then raise exception 'hard limit was not enforced: %', result; end if;
end;
$$;

-- Two unverified requests racing for the third remaining slot must serialize:
-- exactly one succeeds and one receives captcha_required.
delete from public.app_feedback_intake where user_id = '00000000-0000-0000-0000-000000000003';
insert into public.app_feedback_intake(user_id, fingerprint, delivery_state)
values
  ('00000000-0000-0000-0000-000000000003', md5('parallel-existing-1'), 'delivered'),
  ('00000000-0000-0000-0000-000000000003', md5('parallel-existing-2'), 'delivered');
create table public.feedback_parallel_results(label text primary key, result jsonb not null);

do $$
declare
  query_a text;
  query_b text;
begin
  perform dblink_connect('feedback_a', 'dbname=' || current_database());
  perform dblink_connect('feedback_b', 'dbname=' || current_database());
  query_a := $query$
    with configured as (select set_config('request.jwt.claims', '{"role":"service_role"}', true))
    insert into public.feedback_parallel_results(label, result)
    select 'a', public.reserve_app_feedback_intake_server(
      '00000000-0000-0000-0000-000000000003', md5('parallel-a'), false
    ) from configured returning label, result
  $query$;
  query_b := $query$
    with configured as (select set_config('request.jwt.claims', '{"role":"service_role"}', true))
    insert into public.feedback_parallel_results(label, result)
    select 'b', public.reserve_app_feedback_intake_server(
      '00000000-0000-0000-0000-000000000003', md5('parallel-b'), false
    ) from configured returning label, result
  $query$;
  perform dblink_send_query('feedback_a', query_a);
  perform dblink_send_query('feedback_b', query_b);
  perform * from dblink_get_result('feedback_a') as t(label text, result jsonb);
  perform * from dblink_get_result('feedback_b') as t(label text, result jsonb);
  perform dblink_disconnect('feedback_a');
  perform dblink_disconnect('feedback_b');
end;
$$;

do $$
declare accepted_count integer; challenged_count integer;
begin
  select count(*) filter (where result ->> 'accepted' = 'true'),
         count(*) filter (where result ->> 'reason' = 'captcha_required')
    into accepted_count, challenged_count
    from public.feedback_parallel_results;
  if accepted_count <> 1 or challenged_count <> 1 then
    raise exception 'parallel limit was not serialized: accepted %, challenged %', accepted_count, challenged_count;
  end if;
end;
$$;

select 'feedback_intake_rate_limits' as test_suite, 'pass' as result;
