grant usage on schema public, auth to anon, authenticated;
grant select on public.profiles, public.hobbies, public.quests, public.quest_members to anon, authenticated;
grant update on public.quests to authenticated;
grant insert, update on public.quest_members to authenticated;

alter table public.profiles enable row level security;
alter table public.hobbies enable row level security;
alter table public.quests enable row level security;
alter table public.quest_members enable row level security;

create policy "profiles readable" on public.profiles for select using (true);
create policy "hobbies readable" on public.hobbies for select using (true);
create policy "quests readable" on public.quests for select using (true);
create policy "members readable" on public.quest_members for select using (true);
create policy "users join quests" on public.quest_members for insert to authenticated
with check (auth.uid() = user_id);

insert into public.profiles (id, display_name) values
  ('10000000-0000-4000-8000-000000000001', 'Host'),
  ('20000000-0000-4000-8000-000000000002', 'Member'),
  ('30000000-0000-4000-8000-000000000003', 'Viewer');

insert into public.quests (id, creator_id, title, starts_at, ends_at, completed_at, status, created_at) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Future', now() + interval '1 day', null, null, 'open', now()),
  ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Past', now() - interval '1 second', null, null, 'open', now()),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Undated', null, null, null, 'open', now()),
  ('00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Completed future', now() + interval '1 day', null, now(), 'open', now()),
  ('00000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Closed future', now() + interval '1 day', null, null, 'closed', now()),
  ('00000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'Ended future', now() + interval '1 day', now() - interval '1 second', null, 'open', now());

set role anon;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare ids uuid[]; total bigint;
begin
  select array_agg(id order by id), max(total_count) into ids, total
  from public.list_home_quests('soonest', '', null, null, null, null, false, null, false, null, 100, now());
  if ids <> array[
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  ] or total <> 2 then
    raise exception 'anonymous discovery mismatch: ids %, total %', ids, total;
  end if;
end $$;

reset role;
insert into public.quests (id, creator_id, title, starts_at, status, created_at) values
  ('00000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'Timezone exact boundary', '2026-10-22T10:00:00-04:00', 'open', now()),
  ('00000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'Timezone offset future', '2026-10-23T10:30:00+14:00', 'open', now());

set role anon;
do $$
declare ids uuid[];
begin
  select array_agg(id order by id) into ids
  from public.list_home_quests('soonest', 'Timezone', null, null, null, null, false, null, false, null, 100, '2026-10-22T14:00:00Z');
  if ids <> array['00000000-0000-4000-8000-000000000008'::uuid] then
    raise exception 'timezone/boundary discovery mismatch: %', ids;
  end if;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

do $$
declare ids uuid[];
begin
  select array_agg(id order by id) into ids
  from public.list_home_quests('soonest', '', null, null, null, null, false, null, false, null, 100, now());
  if '00000000-0000-4000-8000-000000000002'::uuid = any(ids) then
    raise exception 'host past quest leaked into discovery';
  end if;
  if not exists (select 1 from public.quests where id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'host lost direct history access';
  end if;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', false);

insert into public.quest_members (quest_id, user_id, status)
values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'approved');

insert into public.quest_members (quest_id, user_id, status)
values ('00000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'approved');

do $$
begin
  begin
    insert into public.quest_members (quest_id, user_id, status)
    values ('00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'approved');
    raise exception 'past quest unexpectedly accepted a join';
  exception when others then
    if sqlerrm = 'past quest unexpectedly accepted a join' then raise; end if;
    if sqlerrm <> 'This quest is no longer accepting guests.' then raise; end if;
  end;
end $$;

reset role;
update public.quests set starts_at = now() - interval '1 second'
where id = '00000000-0000-4000-8000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', false);
do $$ begin
  if not exists (
    select 1 from public.quest_members m join public.quests q on q.id = m.quest_id
    where m.user_id = auth.uid() and q.id = '00000000-0000-4000-8000-000000000001'
  ) then raise exception 'joined member lost history access'; end if;
end $$;

reset role;
