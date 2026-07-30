-- Versioned EULA consent, content filtering, block reporting, and moderation SLA.

alter table public.profiles
  add column if not exists eula_version text null,
  add column if not exists eula_accepted_at timestamptz null,
  add column if not exists moderation_status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_moderation_status_check;
alter table public.profiles
  add constraint profiles_moderation_status_check
  check (moderation_status in ('active', 'suspended', 'banned'));

alter table public.reports
  add column if not exists response_due_at timestamptz null;

update public.reports
set response_due_at = created_at + interval '24 hours'
where response_due_at is null;

alter table public.reports
  alter column response_due_at set default (now() + interval '24 hours');

create index if not exists reports_open_response_due_idx
  on public.reports (response_due_at)
  where status not in ('resolved', 'dismissed');

create or replace function public.accept_current_eula(accepted_version text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid := auth.uid();
  current_version constant text := '2026-07-30';
begin
  if account_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if accepted_version is distinct from current_version then
    raise exception using errcode = '22023', message = 'Please review and accept the current EULA.';
  end if;

  update public.profiles
  set eula_version = current_version,
      eula_accepted_at = now(),
      updated_at = now()
  where id = account_id;
  return found;
end;
$$;

revoke all on function public.accept_current_eula(text) from public, anon;
grant execute on function public.accept_current_eula(text) to authenticated;

create or replace function public.contains_objectionable_content(input_text text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text;
begin
  if input_text is null or btrim(input_text) = '' then return false; end if;
  normalized := regexp_replace(lower(input_text), '[^a-z0-9]+', ' ', 'g');
  return normalized ~ (
    '(^| )(kill yourself|go die|i will kill you|rape you|child porn|sexual services|send nudes)( |$)'
    || '|(^| )(n[i1]gg(er|a)|f[a4]gg(ot)?|k[i1]ke|ch[i1]nk)( |$)'
  );
end;
$$;

create or replace function public.reject_objectionable_quest_content()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.contains_objectionable_content(new.title) or public.contains_objectionable_content(new.description) then
    raise exception using errcode = '22023', message = 'This listing contains content prohibited by the QuestHat EULA.';
  end if;
  return new;
end;
$$;

drop trigger if exists quests_reject_objectionable_content on public.quests;
create trigger quests_reject_objectionable_content
before insert or update of title, description on public.quests
for each row execute function public.reject_objectionable_quest_content();

create or replace function public.reject_objectionable_message_content()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.contains_objectionable_content(new.body) then
    raise exception using errcode = '22023', message = 'This message contains content prohibited by the QuestHat EULA.';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_reject_objectionable_content on public.messages;
create trigger messages_reject_objectionable_content
before insert or update of body on public.messages
for each row execute function public.reject_objectionable_message_content();

create or replace function public.reject_objectionable_profile_content()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.contains_objectionable_content(new.display_name) or public.contains_objectionable_content(new.bio) then
    raise exception using errcode = '22023', message = 'This profile contains content prohibited by the QuestHat EULA.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reject_objectionable_content on public.profiles;
create trigger profiles_reject_objectionable_content
before insert or update of display_name, bio on public.profiles
for each row execute function public.reject_objectionable_profile_content();

-- Public comments and private chat share the messages table.

-- Restrictive policies combine with every permissive read policy, preventing
-- future client queries from accidentally restoring blocked content.
drop policy if exists quests_hide_blocked_creators on public.quests;
create policy quests_hide_blocked_creators
on public.quests as restrictive for select to authenticated
using (
  creator_id = auth.uid()
  or public.current_profile_role() in ('moderator', 'admin', 'super_admin')
  or not exists (
    select 1 from public.friends blocked_edge
    where blocked_edge.status = 'blocked'
      and (
        (blocked_edge.requester_id = auth.uid() and blocked_edge.addressee_id = quests.creator_id)
        or (blocked_edge.addressee_id = auth.uid() and blocked_edge.requester_id = quests.creator_id)
      )
  )
);

drop policy if exists messages_hide_blocked_senders on public.messages;
create policy messages_hide_blocked_senders
on public.messages as restrictive for select to authenticated
using (
  sender_id = auth.uid()
  or public.current_profile_role() in ('moderator', 'admin', 'super_admin')
  or not exists (
    select 1 from public.friends blocked_edge
    where blocked_edge.status = 'blocked'
      and (
        (blocked_edge.requester_id = auth.uid() and blocked_edge.addressee_id = messages.sender_id)
        or (blocked_edge.addressee_id = auth.uid() and blocked_edge.requester_id = messages.sender_id)
      )
  )
);

create or replace function public.report_new_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid := gen_random_uuid();
  reporter_label text;
  target_label text;
begin
  if new.status <> 'blocked' or (tg_op = 'UPDATE' and old.status = 'blocked') then
    return new;
  end if;

  select coalesce(p.display_name, p.username, p.id::text) into reporter_label
  from public.profiles p where p.id = new.requester_id;
  select coalesce(p.display_name, p.username, p.id::text) into target_label
  from public.profiles p where p.id = new.addressee_id;

  insert into public.reports (
    id, reporter_id, reported_user_id, context_type, reason_code, details,
    severity, auto_flags, response_due_at
  ) values (
    report_id, new.requester_id, new.addressee_id, 'profile_account', 'user_blocked',
    'A user was blocked. Review the account and recent content for inappropriate or abusive behavior.',
    'high',
    jsonb_build_object(
      'source', 'block_action',
      'reporter_name', coalesce(reporter_label, new.requester_id::text),
      'reported_user_name', coalesce(target_label, new.addressee_id::text),
      'report_target_type', 'user',
      'report_target_id', new.addressee_id,
      'report_target_key', 'profile:' || new.addressee_id::text,
      'report_target_label', coalesce(target_label, new.addressee_id::text),
      'moderation_sla_hours', 24
    ),
    now() + interval '24 hours'
  );

  begin
    perform net.http_post(
      url := 'https://questhat.com/api/report-alert',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('report_id', report_id)
    );
  exception
    when undefined_function or undefined_table or insufficient_privilege then
      raise notice 'Immediate block alert skipped; report remains queued.';
  end;

  return new;
end;
$$;

drop trigger if exists friends_report_new_block on public.friends;
create trigger friends_report_new_block
after insert or update of status on public.friends
for each row execute function public.report_new_block();

create or replace function public.apply_moderation_enforcement(
  p_report_id uuid,
  p_status text,
  p_action_type text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moderator_id uuid := auth.uid();
  target_report public.reports%rowtype;
begin
  if moderator_id is null or public.current_profile_role() not in ('moderator', 'admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'Moderator access required.';
  end if;
  if p_status not in ('open', 'triaged', 'reviewing', 'resolved', 'dismissed', 'escalated') then
    raise exception using errcode = '22023', message = 'Invalid report status.';
  end if;
  if p_action_type not in ('warn', 'mute', 'suspend', 'ban', 'dismiss', 'request_more_info') then
    raise exception using errcode = '22023', message = 'Invalid moderation action.';
  end if;

  select * into target_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found.';
  end if;

  insert into public.report_actions (report_id, actor_id, action_type, note)
  values (p_report_id, moderator_id, p_action_type, nullif(btrim(p_note), ''));

  update public.reports
  set status = p_status,
      reviewed_by = moderator_id,
      reviewed_at = now(),
      resolution_note = nullif(btrim(p_note), ''),
      admin_assignee_id = moderator_id
  where id = p_report_id;

  if p_action_type in ('suspend', 'ban') and target_report.reported_user_id is not null then
    update public.profiles
    set moderation_status = case when p_action_type = 'ban' then 'banned' else 'suspended' end,
        deactivated_at = coalesce(deactivated_at, now()),
        updated_at = now()
    where id = target_report.reported_user_id;

    update public.push_tokens
    set active = false, updated_at = now()
    where user_id = target_report.reported_user_id;
  end if;

  -- The report foreign keys use ON DELETE SET NULL, preserving the audit trail.
  if p_action_type in ('suspend', 'ban') and target_report.message_id is not null then
    delete from public.messages where id = target_report.message_id;
  end if;
  if p_action_type in ('suspend', 'ban') and target_report.quest_id is not null then
    delete from public.quests where id = target_report.quest_id;
  end if;

  return true;
end;
$$;

revoke all on function public.apply_moderation_enforcement(uuid, text, text, text) from public, anon;
grant execute on function public.apply_moderation_enforcement(uuid, text, text, text) to authenticated;

create or replace function public.reactivate_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if exists (
    select 1 from public.profiles
    where id = account_id and moderation_status <> 'active'
  ) then
    raise exception using errcode = '42501', message = 'This account cannot be restored. Contact support@questhat.com.';
  end if;

  update public.profiles
  set deactivated_at = null, updated_at = now()
  where id = account_id;
  return found;
end;
$$;

revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.reactivate_my_account() to authenticated;
