-- Prevent duplicate joins per user per listing

alter table public.quest_members
  add constraint quest_members_unique_membership unique (quest_id, user_id);
