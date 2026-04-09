-- Reports system v1 (context-aware)

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid null references public.profiles(id) on delete set null,
  quest_id uuid null references public.quests(id) on delete set null,
  message_id uuid null references public.messages(id) on delete set null,
  context_type text not null check (context_type in ('listing_content','chat_behavior','profile_account','in_person')),
  reason_code text not null,
  details text null,
  evidence_urls jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','triaged','resolved','dismissed')),
  severity text not null default 'normal' check (severity in ('low','normal','high','critical')),
  auto_flags jsonb not null default '{}'::jsonb,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  resolution_note text null
);

create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index if not exists reports_target_user_idx on public.reports (reported_user_id, created_at desc);
create index if not exists reports_quest_idx on public.reports (quest_id, created_at desc);
create index if not exists reports_status_idx on public.reports (status, severity, created_at desc);

create table if not exists public.report_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report_id uuid not null references public.reports(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('warn','mute','suspend','ban','dismiss','request_more_info')),
  note text null
);

create index if not exists report_actions_report_idx on public.report_actions (report_id, created_at desc);

alter table public.reports enable row level security;
alter table public.report_actions enable row level security;

-- Reporter can create and view only their own reports
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
for select to authenticated
using (reporter_id = auth.uid());

-- No direct update/delete from clients in v1

-- Reporter can read actions for reports they created
drop policy if exists report_actions_select_for_own_reports on public.report_actions;
create policy report_actions_select_for_own_reports on public.report_actions
for select to authenticated
using (
  exists (
    select 1 from public.reports r
    where r.id = report_actions.report_id and r.reporter_id = auth.uid()
  )
);
