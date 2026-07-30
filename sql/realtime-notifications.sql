-- Realtime publication for live notifications and inbox updates.
-- This lets the mobile app receive row changes without waiting for a reopen.

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table if not exists public.notifications;
alter publication supabase_realtime add table if not exists public.messages;
alter publication supabase_realtime add table if not exists public.quest_members;
