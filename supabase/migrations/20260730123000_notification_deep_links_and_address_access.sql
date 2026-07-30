-- Include a stable notification identifier in every push payload so the app can
-- mark the tapped item read before routing to its destination.
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

-- Address access is a server-owned event. This guarantees both an in-app
-- notification and a push regardless of which client grants access.
create or replace function public.notify_exact_location_access_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_title text;
  quest_creator_id uuid;
begin
  select q.title, q.creator_id
  into quest_title, quest_creator_id
  from public.quests q
  where q.id = new.quest_id;

  if quest_creator_id is null or new.user_id = quest_creator_id then
    return new;
  end if;

  perform public.create_notification(
    new.user_id,
    'system',
    'Address now available',
    'The exact address for "' || coalesce(quest_title, 'this quest') || '" is now available to you.',
    '/listing/' || new.quest_id::text,
    new.quest_id,
    new.granted_by,
    null,
    new.user_id,
    jsonb_build_object('kind', 'exact_location_access')
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_exact_location_access_insert on public.quest_exact_location_access;
create trigger trg_notify_exact_location_access_insert
after insert on public.quest_exact_location_access
for each row execute function public.notify_exact_location_access_insert();
