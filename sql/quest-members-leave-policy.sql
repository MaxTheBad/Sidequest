-- Allow users to leave a listing (delete their own membership row)

create policy if not exists "users leave own quest memberships"
on public.quest_members for delete
using (auth.uid() = user_id and role <> 'creator');
