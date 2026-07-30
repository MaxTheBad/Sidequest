-- Push dispatch trigger for QuestHat notifications
-- This makes notification inserts fan out to the push dispatcher so
-- joins, approvals, messages, and comments all follow the same server-side path.

do $$
begin
  create extension if not exists pg_net;
exception
  when insufficient_privilege or feature_not_supported or undefined_file then
    raise notice 'pg_net extension could not be enabled automatically. Push dispatch trigger will still be created, but HTTP delivery requires pg_net to be available in Supabase.';
end $$;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret constant text := 'questhat-push-dispatch-v1';
  dispatch_url constant text := 'https://ipjewvmmzmxakoewqlfo.functions.supabase.co/push-notification-dispatch';
begin
  begin
    perform net.http_post(
      url := dispatch_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-dispatch-secret', dispatch_secret
      ),
      body := jsonb_build_object(
        'notificationId', new.id,
        'userId', new.user_id,
        'title', new.title,
        'body', new.body,
        'data', jsonb_build_object(
          'notificationId', new.id,
          'href', new.href,
          'kind', new.kind,
          'questId', new.quest_id,
          'sourceUserId', new.source_user_id,
          'membershipUserId', new.membership_user_id,
          'meta', coalesce(new.meta, '{}'::jsonb)
        )
      )
    );
  exception
    when undefined_function or undefined_table or insufficient_privilege then
      raise notice 'Push dispatch skipped because pg_net is unavailable or not permitted in this environment.';
  end;

  return new;
end;
$$;

drop trigger if exists trg_dispatch_push_notification on public.notifications;
create trigger trg_dispatch_push_notification
after insert on public.notifications
for each row execute function public.dispatch_push_notification();
