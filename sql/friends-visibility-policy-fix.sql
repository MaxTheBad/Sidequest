-- Fix friends-list visibility behavior:
-- - Anyone can read accepted friendships (for public friends lists)
-- - Pending/blocked remain visible only to participants

drop policy if exists "friends readable by participants" on public.friends;
create policy "friends readable by visibility"
on public.friends for select
using (
  status = 'accepted'
  or auth.uid() = requester_id
  or auth.uid() = addressee_id
);
