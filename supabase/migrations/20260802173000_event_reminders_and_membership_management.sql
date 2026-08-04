alter table public.quests
  add column if not exists starts_at timestamptz,
  add column if not exists start_reminder_sent_at timestamptz;

create index if not exists quests_upcoming_reminders_idx
  on public.quests (starts_at)
  where starts_at is not null and start_reminder_sent_at is null;

alter table public.notification_preferences
  add column if not exists quest_reminders boolean not null default true;

create or replace function public.manage_quest_membership(
  p_quest_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_share_exact_address boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  changed_rows integer;
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;
  if p_status not in ('approved', 'declined', 'pending') then
    raise exception 'Invalid membership status.';
  end if;
  if not exists (
    select 1
    from public.quests q
    where q.id = p_quest_id
      and (
        q.creator_id = caller_id
        or exists (
          select 1
          from public.quest_members manager
          where manager.quest_id = q.id
            and manager.user_id = caller_id
            and manager.role = 'cohost'
            and manager.status = 'approved'
        )
      )
  ) then
    raise exception 'Only the host or an approved co-host can manage join requests.';
  end if;

  update public.quest_members
  set status = p_status
  where quest_id = p_quest_id
    and user_id = p_target_user_id
    and role <> 'creator';
  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    return false;
  end if;

  if p_status <> 'approved' or not p_share_exact_address then
    delete from public.quest_exact_location_access
    where quest_id = p_quest_id and user_id = p_target_user_id;
  else
    insert into public.quest_exact_location_access (quest_id, user_id, granted_by)
    values (p_quest_id, p_target_user_id, caller_id)
    on conflict (quest_id, user_id) do update set granted_by = excluded.granted_by;
  end if;

  return true;
end;
$$;

revoke all on function public.manage_quest_membership(uuid, uuid, text, boolean) from public;
grant execute on function public.manage_quest_membership(uuid, uuid, text, boolean) to authenticated;

create or replace function public.send_upcoming_quest_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_row record;
  recipient record;
  reminder_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('quest-start-reminders', 0));

  for quest_row in
    select q.id, q.creator_id, q.title, q.starts_at
    from public.quests q
    where q.starts_at > now()
      and q.starts_at <= now() + interval '35 minutes'
      and q.start_reminder_sent_at is null
    order by q.starts_at
    for update skip locked
  loop
    for recipient in
      select distinct candidates.user_id
      from (
        select quest_row.creator_id as user_id
        union all
        select member.user_id
        from public.quest_members member
        where member.quest_id = quest_row.id
          and member.status = 'approved'
      ) candidates
      left join public.notification_preferences preference on preference.user_id = candidates.user_id
      where coalesce(preference.quest_reminders, true)
    loop
      perform public.create_notification(
        recipient.user_id,
        'system',
        'Your quest starts soon',
        '"' || left(coalesce(quest_row.title, 'Your quest'), 100) || '" starts in about 30 minutes.',
        '/listing/' || quest_row.id::text,
        quest_row.id,
        quest_row.creator_id,
        null,
        null,
        jsonb_build_object('kind', 'quest_start_reminder', 'starts_at', quest_row.starts_at)
      );
      reminder_count := reminder_count + 1;
    end loop;

    update public.quests
    set start_reminder_sent_at = now()
    where id = quest_row.id;
  end loop;

  return reminder_count;
end;
$$;

revoke all on function public.send_upcoming_quest_reminders() from public;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'quest-start-reminders-v1';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
  perform cron.schedule(
    'quest-start-reminders-v1',
    '*/5 * * * *',
    'select public.send_upcoming_quest_reminders();'
  );
end;
$$;
