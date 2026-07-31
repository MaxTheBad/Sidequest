alter table public.notification_preferences
  alter column followed_posts set default false;

create or replace function public.notify_quest_discovery_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator_name text;
  category_name text;
  recipient record;
begin
  select coalesce(display_name, username, 'Someone')
  into creator_name
  from public.profiles
  where id = new.creator_id;

  select coalesce(nullif(trim(name), ''), nullif(trim(category), ''), 'a category you like')
  into category_name
  from public.hobbies
  where id = new.hobby_id;

  for recipient in
    with candidates as (
      select
        case
          when f.requester_id = new.creator_id then f.addressee_id
          else f.requester_id
        end as user_id,
        'followed_post'::text as source_kind,
        1 as priority
      from public.friends f
      join public.notification_preferences p on p.user_id = case
        when f.requester_id = new.creator_id then f.addressee_id
        else f.requester_id
      end
      where f.status = 'accepted'
        and (f.requester_id = new.creator_id or f.addressee_id = new.creator_id)
        and p.followed_posts = true

      union all

      select
        uh.user_id,
        'liked_category'::text as source_kind,
        2 as priority
      from public.user_hobbies uh
      join public.notification_preferences p on p.user_id = uh.user_id
      where uh.hobby_id = new.hobby_id
        and p.liked_categories = true
    )
    select distinct on (user_id) user_id, source_kind
    from candidates
    where user_id <> new.creator_id
    order by user_id, priority
  loop
    perform public.create_notification(
      recipient.user_id,
      'system',
      case
        when recipient.source_kind = 'followed_post'
          then coalesce(creator_name, 'Someone') || ' posted a new quest'
        else 'New ' || coalesce(category_name, 'interest') || ' quest'
      end,
      '"' || left(coalesce(new.title, 'New quest'), 120) || '"',
      '/listing/' || new.id::text,
      new.id,
      new.creator_id,
      null,
      null,
      jsonb_build_object(
        'kind', recipient.source_kind,
        'quest_title', new.title,
        'category', category_name
      )
    );
  end loop;

  return new;
end;
$$;
