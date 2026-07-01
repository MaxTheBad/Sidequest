-- Allow listing creators to delete their own quests.
-- Related rows with foreign keys using "on delete cascade" are removed by Postgres.

drop policy if exists "creator deletes own quests" on public.quests;
create policy "creator deletes own quests"
on public.quests for delete
to authenticated
using (auth.uid() = creator_id);
