alter table public.quests
  add column if not exists join_request_reminder_sent_at timestamptz,
  add column if not exists location_reminder_24h_sent_at timestamptz,
  add column if not exists location_reminder_2h_sent_at timestamptz,
  add column if not exists host_coordination_reminders_disabled boolean not null default false,
  add column if not exists host_coordination_reminders_snoozed_until timestamptz;

create or replace function public.set_host_coordination_reminders(
  p_quest_id uuid,
  p_enabled boolean,
  p_snoozed_until timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  update public.quests
  set
    host_coordination_reminders_disabled = not p_enabled,
    host_coordination_reminders_snoozed_until = case when p_enabled then p_snoozed_until else null end
  where id = p_quest_id
    and creator_id = auth.uid();
  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.set_host_coordination_reminders(uuid, boolean, timestamptz) from public;
grant execute on function public.set_host_coordination_reminders(uuid, boolean, timestamptz) to authenticated;

create or replace function public.send_host_coordination_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_row record;
  sent_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('host-coordination-reminders', 0));

  for quest_row in
    select
      q.id,
      q.creator_id,
      q.title,
      count(member.user_id)::integer as pending_count
    from public.quests q
    join public.quest_members member
      on member.quest_id = q.id
      and member.status = 'pending'
      and member.joined_at <= now() - interval '45 minutes'
    where coalesce(q.status, 'open') = 'open'
      and not q.host_coordination_reminders_disabled
      and (q.host_coordination_reminders_snoozed_until is null or q.host_coordination_reminders_snoozed_until <= now())
      and (q.join_request_reminder_sent_at is null or q.join_request_reminder_sent_at <= now() - interval '24 hours')
    group by q.id, q.creator_id, q.title
  loop
    perform public.create_notification(
      quest_row.creator_id,
      'system',
      case when quest_row.pending_count = 1 then 'A join request is waiting' else quest_row.pending_count || ' join requests are waiting' end,
      'Review requests for "' || left(coalesce(quest_row.title, 'your quest'), 100) || '".',
      '/listing/' || quest_row.id::text,
      quest_row.id,
      null,
      null,
      null,
      jsonb_build_object('kind', 'host_join_request_reminder', 'pending_count', quest_row.pending_count)
    );
    update public.quests set join_request_reminder_sent_at = now() where id = quest_row.id;
    sent_count := sent_count + 1;
  end loop;

  for quest_row in
    select
      q.id,
      q.creator_id,
      q.title,
      q.starts_at,
      count(member.user_id)::integer as missing_count
    from public.quests q
    join public.quest_members member
      on member.quest_id = q.id
      and member.status = 'approved'
      and member.role <> 'creator'
      and member.user_id <> q.creator_id
    left join public.quest_exact_location_access access
      on access.quest_id = q.id and access.user_id = member.user_id
    where coalesce(q.status, 'open') = 'open'
      and q.starts_at > now()
      and q.starts_at <= now() + interval '24 hours'
      and nullif(trim(q.exact_address), '') is not null
      and q.exact_location_visibility <> 'public'
      and access.user_id is null
      and not q.host_coordination_reminders_disabled
      and (q.host_coordination_reminders_snoozed_until is null or q.host_coordination_reminders_snoozed_until <= now())
      and (
        (q.starts_at <= now() + interval '2 hours' and q.location_reminder_2h_sent_at is null)
        or
        (q.starts_at > now() + interval '2 hours' and q.location_reminder_24h_sent_at is null)
      )
    group by q.id, q.creator_id, q.title, q.starts_at
  loop
    perform public.create_notification(
      quest_row.creator_id,
      'system',
      case when quest_row.starts_at <= now() + interval '2 hours' then 'Guests still need the location' else 'Location has not been shared' end,
      quest_row.missing_count || case when quest_row.missing_count = 1 then ' guest needs' else ' guests need' end || ' the exact location for "' || left(coalesce(quest_row.title, 'your quest'), 90) || '".',
      '/listing/' || quest_row.id::text,
      quest_row.id,
      null,
      null,
      null,
      jsonb_build_object(
        'kind', 'host_location_reminder',
        'missing_count', quest_row.missing_count,
        'starts_at', quest_row.starts_at,
        'urgency', case when quest_row.starts_at <= now() + interval '2 hours' then 'two_hours' else 'day' end
      )
    );
    update public.quests
    set
      location_reminder_24h_sent_at = coalesce(location_reminder_24h_sent_at, now()),
      location_reminder_2h_sent_at = case when quest_row.starts_at <= now() + interval '2 hours' then now() else location_reminder_2h_sent_at end
    where id = quest_row.id;
    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke all on function public.send_host_coordination_reminders() from public;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'host-coordination-reminders-v1';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
  perform cron.schedule(
    'host-coordination-reminders-v1',
    '*/15 * * * *',
    'select public.send_host_coordination_reminders();'
  );
end;
$$;
