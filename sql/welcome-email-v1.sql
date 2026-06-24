-- QuestHat welcome email tracking

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz null;

create index if not exists profiles_welcome_email_sent_at_idx
  on public.profiles (welcome_email_sent_at);
