-- Hosts still receive the immediate join-request notification. Remove only the
-- repeated "requests are waiting" reminder while retaining location reminders.
delete from public.notifications
where kind = 'system'
  and meta ->> 'kind' = 'host_join_request_reminder';

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
