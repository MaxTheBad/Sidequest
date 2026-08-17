-- Store the push-dispatch credential in Supabase Vault instead of source code.
-- Before applying this migration in production, create a strong secret named
-- `questhat_push_dispatch_secret` in Vault and set the same value as the Edge
-- Function secret `PUSH_DISPATCH_SECRET`.
create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dispatch_secret text;
  dispatch_url constant text := 'https://ipjewvmmzmxakoewqlfo.functions.supabase.co/push-notification-dispatch';
begin
  begin
    select decrypted_secret
      into dispatch_secret
      from vault.decrypted_secrets
     where name = 'questhat_push_dispatch_secret'
     order by created_at desc
     limit 1;

    if dispatch_secret is null or length(dispatch_secret) < 32 then
      raise warning 'Push dispatch skipped because questhat_push_dispatch_secret is not configured in Vault.';
      return new;
    end if;

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
      raise warning 'Push dispatch skipped because Vault or pg_net is unavailable or not permitted.';
  end;

  return new;
end;
$$;
