-- Friends phase 2: visibility + request management actions

alter table if exists public.profiles
  add column if not exists friends_visibility text not null default 'public'
  check (friends_visibility in ('public','private'));

-- Allow participants to cancel/remove requests/friendship rows
drop policy if exists "friends delete participants" on public.friends;
create policy "friends delete participants"
on public.friends for delete
using (auth.uid() = requester_id or auth.uid() = addressee_id);
