-- Disposable local DB only. Never insert these synthetic identities in production.
create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed: %',label; end if; end$$;
create function public.test_denied(statement text) returns void language plpgsql as $$begin begin execute statement; exception when insufficient_privilege or invalid_parameter_value then return; end; raise exception 'Expected access/validation denial'; end$$;
insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6)n;
insert into public.profiles(id) select id from auth.users;
insert into public.staff_members values('00000000-0000-0000-0000-000000000006','admin',true);

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2"}',false);
select public.test_assert(not public.record_city_usage('00000000-0000-0000-0000-000000000001','discovery_loaded'),'default no contribution');
select public.test_assert(not public.record_city_usage('00000000-0000-0000-0000-000000000002','discovery_loaded'),'actor mismatch cannot record');
select public.test_denied($q$select public.set_city_usage_preference('00000000-0000-0000-0000-000000000002',true,'Miami, FL')$q$);
select public.test_denied($q$select public.set_city_usage_preference('00000000-0000-0000-0000-000000000001',true,'123 Main Street')$q$);
select public.test_denied($q$select * from questhat_analytics.city_daily_counts$q$);
select public.test_denied($q$select * from public.admin_city_usage_report()$q$);
select public.set_city_usage_preference('00000000-0000-0000-0000-000000000001',true,'Miami, FL');
select public.test_assert(not public.record_city_usage('00000000-0000-0000-0000-000000000001','private-message'),'unapproved kind rejected');
select public.test_assert(not public.record_city_usage('00000000-0000-0000-0000-000000000001',null),'null kind rejected');
select public.test_assert(public.record_city_usage('00000000-0000-0000-0000-000000000001','discovery_loaded'),'explicit preference contributes');
reset role;

-- Four consenting actors are suppressed even with high event volume.
insert into questhat_analytics.city_preferences(user_id,selected_city)
  select id,'Miami, FL' from auth.users where id::text<'00000000-0000-0000-0000-000000000005' on conflict do nothing;
delete from questhat_analytics.city_daily_counts;
insert into questhat_analytics.city_daily_counts
  select user_id,(date_trunc('week',now() at time zone 'UTC'))::date-1,selected_city,'discovery_loaded',3 from questhat_analytics.city_preferences;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","aal":"aal1"}',false);
select public.test_denied($q$select * from public.admin_city_usage_report()$q$);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","aal":"aal2"}',false);
select public.test_assert((select count(*)=0 from public.admin_city_usage_report()),'four actors suppressed');
reset role;
insert into questhat_analytics.city_preferences values('00000000-0000-0000-0000-000000000005','Miami, FL',now());
insert into questhat_analytics.city_daily_counts values('00000000-0000-0000-0000-000000000005',(date_trunc('week',now() at time zone 'UTC'))::date-1,'Miami, FL','discovery_loaded',4);
insert into questhat_analytics.city_daily_counts values('00000000-0000-0000-0000-000000000001',(date_trunc('week',now() at time zone 'UTC'))::date-1,'Miami, FL','quest_created',999);
set role authenticated;
select public.test_assert((select count(*)=1 and min(recorded_actions_at_least)=15 and min(contributing_accounts_at_least)=5 from public.admin_city_usage_report()),'five-account report rounded; thin created cohort omitted');
reset role;
update public.staff_members set role='moderator';
set role authenticated;
select public.test_denied($q$select * from public.admin_city_usage_report()$q$);
reset role;
update public.staff_members set role='admin';
update public.profiles set deactivated_at=now() where id='00000000-0000-0000-0000-000000000006';
set role authenticated;
select public.test_denied($q$select * from public.admin_city_usage_report()$q$);
reset role;
update public.profiles set deactivated_at=null;
-- NULL authorization helpers must also fail closed (SQL three-valued logic).
create or replace function public.current_staff_role() returns text language sql stable as $$select null::text$$;
set role authenticated;
select public.test_denied($q$select * from public.admin_city_usage_report()$q$);
reset role;

-- City changes delete the old contribution history, withdrawal cascades, account deletion cascades.
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal1"}',false);
select public.set_city_usage_preference('00000000-0000-0000-0000-000000000001',true,'Fort Lauderdale, FL');
reset role;
select public.test_assert((select count(*)=0 from questhat_analytics.city_daily_counts where user_id='00000000-0000-0000-0000-000000000001'),'city-change old counters deleted');
set role authenticated;
select public.record_city_usage('00000000-0000-0000-0000-000000000001','quest_created');
select public.set_city_usage_preference('00000000-0000-0000-0000-000000000001',false,null);
select public.test_assert(not public.record_city_usage('00000000-0000-0000-0000-000000000001','quest_created'),'withdrawn no future contribution');
reset role;
select public.test_assert((select count(*)=0 from questhat_analytics.city_daily_counts where user_id='00000000-0000-0000-0000-000000000001'),'withdrawal deletes all counters');
delete from auth.users where id='00000000-0000-0000-0000-000000000005';
select public.test_assert((select count(*)=0 from questhat_analytics.city_preferences where user_id='00000000-0000-0000-0000-000000000005'),'account preference cascades');
select public.test_assert((select count(*)=0 from questhat_analytics.city_daily_counts where user_id='00000000-0000-0000-0000-000000000005'),'account counters cascade');

-- Validate actual scheduled cleanup command, with no legacy-cipher/key/provider dependency.
insert into questhat_analytics.city_daily_counts values('00000000-0000-0000-0000-000000000002',(now() at time zone 'UTC')::date-31,'Miami, FL','quest_created',1);
do $$begin execute (select command from cron.job where jobname='questhat-city-usage-retention'); end$$;
select public.test_assert(not exists(select 1 from questhat_analytics.city_daily_counts where recorded_day <=(now() at time zone 'UTC')::date-30),'scheduled retention deletes old counters');
select public.test_assert((select schedule='17 * * * *' from cron.job where jobname='questhat-city-usage-retention'),'hourly cleanup configured');
set role anon;
select public.test_denied($q$select * from public.admin_city_usage_report()$q$);
select public.test_denied($q$select * from questhat_analytics.city_preferences$q$);
reset role;
select 'PASS: city usage actor isolation, consent, per-metric five-account suppression, MFA/admin restriction, rounding, withdrawal/city-change/account deletion and retention' as result;
