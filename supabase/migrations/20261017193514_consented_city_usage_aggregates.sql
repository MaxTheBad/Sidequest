-- User-approved design: explicit selected-city opt-in, suppressed counts,
-- detailed third-party funnels separately opt-in. No IP/GPS-derived city.
create schema if not exists questhat_analytics;
revoke all on schema questhat_analytics from public, anon, authenticated;

create table questhat_analytics.city_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_city text not null check (
    char_length(selected_city) between 2 and 80
    and selected_city ~ '^[[:alpha:]][[:alpha:][:space:]’.,-]+$'
    and selected_city !~* '\m(street|road|avenue|boulevard|drive|lane|court|suite|apartment)\M'
  ),
  opted_in_at timestamptz not null default now()
);
create table questhat_analytics.city_daily_counts (
  user_id uuid not null references questhat_analytics.city_preferences(user_id) on delete cascade,
  recorded_day date not null,
  selected_city text not null,
  metric text not null check (metric in (
    'discovery_loaded','quest_created','quest_join_requested','join_approved','join_declined',
    'first_approved_guest','approval_wait_under_5m','approval_wait_5_30m','approval_wait_30m_2h','approval_wait_2h_plus'
  )),
  action_count integer not null check (action_count between 1 and 1000),
  primary key(user_id,recorded_day,selected_city,metric)
);
create index city_daily_counts_retention on questhat_analytics.city_daily_counts(recorded_day);
alter table questhat_analytics.city_preferences enable row level security;
alter table questhat_analytics.city_daily_counts enable row level security;
revoke all on all tables in schema questhat_analytics from public, anon, authenticated;
comment on table questhat_analytics.city_daily_counts is
  'Account-linked internal counters, NOT anonymous source data. No IP/GPS, exact times, content or quest IDs. Delete after 30 days at next hourly cleanup (max31days); withdrawal/account deletion cascades. Fixed weekly admin reports suppress each city/metric below5consenting accounts and round down to multiples of5.';

create or replace function public.my_city_usage_preference(p_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'Authentication required.' using errcode='42501'; end if;
  return coalesce((select jsonb_build_object('enabled',true,'selected_city',p.selected_city)
    from questhat_analytics.city_preferences p where p.user_id=auth.uid()),jsonb_build_object('enabled',false,'selected_city',null));
end $$;

create or replace function public.set_city_usage_preference(p_actor_id uuid,p_enabled boolean,p_selected_city text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen_city text := regexp_replace(btrim(coalesce(p_selected_city,'')),'[[:space:]]+',' ','g');
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.deactivated_at is null) then raise exception 'Active account required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('city-usage:'||auth.uid()::text,0));
  if not coalesce(p_enabled,false) then
    delete from questhat_analytics.city_preferences where user_id=auth.uid();
    return jsonb_build_object('enabled',false,'selected_city',null);
  end if;
  if char_length(chosen_city) not between 2 and 80
    or chosen_city !~ '^[[:alpha:]][[:alpha:][:space:]’.,-]+$'
    or chosen_city ~* '\m(street|road|avenue|boulevard|drive|lane|court|suite|apartment)\M' then
    raise exception 'Choose a city name, not an address, link or coordinates.' using errcode='22023';
  end if;
  -- A changed city starts a new contribution set instead of linking city history.
  if exists(select 1 from questhat_analytics.city_preferences where user_id=auth.uid() and selected_city<>chosen_city) then
    delete from questhat_analytics.city_preferences where user_id=auth.uid();
  end if;
  insert into questhat_analytics.city_preferences(user_id,selected_city) values(auth.uid(),chosen_city)
  on conflict(user_id) do nothing;
  return public.my_city_usage_preference(p_actor_id);
end $$;

create or replace function public.record_city_usage(p_actor_id uuid,p_metric text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen_city text; today date := (now() at time zone 'UTC')::date;
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_id then return false; end if;
  if p_metric is null or p_metric not in ('discovery_loaded','quest_created','quest_join_requested','join_approved','join_declined',
    'first_approved_guest','approval_wait_under_5m','approval_wait_5_30m','approval_wait_30m_2h','approval_wait_2h_plus') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('city-usage:'||auth.uid()::text,0));
  select p.selected_city into chosen_city from questhat_analytics.city_preferences p
    join public.profiles account on account.id=p.user_id and account.deactivated_at is null
    where p.user_id=auth.uid();
  if chosen_city is null then return false; end if;
  delete from questhat_analytics.city_daily_counts where user_id=auth.uid() and recorded_day<=today-30;
  insert into questhat_analytics.city_daily_counts(user_id,recorded_day,selected_city,metric,action_count)
    values(auth.uid(),today,chosen_city,p_metric,1)
  on conflict(user_id,recorded_day,selected_city,metric) do update
    set action_count=least(1000,questhat_analytics.city_daily_counts.action_count+1);
  return true;
end $$;

-- No actor, date-range or city parameter: fixed completed weeks reduce thin
-- cohort/differencing queries. Suppression applies to EACH metric, not city alone.
create or replace function public.admin_city_usage_report()
returns table(week_start date,selected_city text,metric text,recorded_actions_at_least bigint,contributing_accounts_at_least bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or coalesce(public.current_staff_role(),'') not in ('admin','super_admin')
    or not coalesce(public.staff_mfa_verified(),false)
    or not exists(select 1 from public.profiles where id=auth.uid() and deactivated_at is null) then
    raise exception 'An existing MFA-verified administrator is required.' using errcode='42501';
  end if;
  return query
  select date_trunc('week',c.recorded_day::timestamp)::date,c.selected_city,c.metric,
    (floor(sum(c.action_count)::numeric/5)*5)::bigint,(floor(count(distinct c.user_id)::numeric/5)*5)::bigint
  from questhat_analytics.city_daily_counts c
  where c.recorded_day>=((date_trunc('week',now() at time zone 'UTC'))::date-21)
    and c.recorded_day<(date_trunc('week',now() at time zone 'UTC'))::date
    and c.recorded_day>((now() at time zone 'UTC')::date-30)
  group by 1,c.selected_city,c.metric
  having count(distinct c.user_id)>=5
  order by 1 desc,2,3;
end $$;

revoke all on function public.my_city_usage_preference(uuid) from public,anon;
revoke all on function public.set_city_usage_preference(uuid,boolean,text) from public,anon;
revoke all on function public.record_city_usage(uuid,text) from public,anon;
revoke all on function public.admin_city_usage_report() from public,anon;
grant execute on function public.my_city_usage_preference(uuid),public.set_city_usage_preference(uuid,boolean,text),
  public.record_city_usage(uuid,text),public.admin_city_usage_report() to authenticated;

-- Existing pg_cron only; no extension install, key, permission or staff change.
do $$ begin
  if exists(select 1 from cron.job where jobname='questhat-city-usage-retention') then raise exception 'Retention job already exists; review drift.'; end if;
end $$;
select cron.schedule('questhat-city-usage-retention','17 * * * *',
  $retention$delete from questhat_analytics.city_daily_counts where recorded_day <= ((now() at time zone 'UTC')::date-30)$retention$);
