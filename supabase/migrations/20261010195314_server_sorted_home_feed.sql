-- Server-side discovery ordering keeps filtering ahead of pagination and lets
-- list/map consumers share one stable row order. This function is explicitly
-- SECURITY INVOKER so existing quest/profile RLS (including block policies)
-- continues to decide which rows each caller may see.
-- There is no quest end timestamp in the live schema. An open/full quest with
-- a past start therefore remains visible as ongoing until its host explicitly
-- closes it; its effective Soonest key is the request's frozen p_now. Undated
-- open/full legacy quests remain visible after dated rows. No end is inferred.
create or replace function public.list_home_quests(
  p_sort text,
  p_search_query text,
  p_hobby_id uuid,
  p_viewer_lat double precision,
  p_viewer_lon double precision,
  p_cursor_time timestamptz,
  p_cursor_time_missing boolean,
  p_cursor_distance double precision,
  p_cursor_distance_missing boolean,
  p_cursor_id uuid,
  p_limit integer,
  p_now timestamptz
)
returns table (
  id uuid,
  creator_id uuid,
  title text,
  description text,
  city text,
  availability text,
  starts_at timestamptz,
  time_flexible boolean,
  group_size integer,
  hobby_id uuid,
  skill_level text,
  join_mode text,
  created_at timestamptz,
  media_items jsonb,
  hobbies jsonb,
  profiles jsonb,
  sort_time timestamptz,
  sort_time_missing boolean,
  sort_distance_miles double precision,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  search_needle text;
begin
  if p_sort not in ('soonest', 'nearest', 'recent') then
    raise exception using errcode = '22023', message = 'Unsupported home sort.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 101 then
    raise exception using errcode = '22023', message = 'Home page limit must be between 1 and 101.';
  end if;
  if p_now is null then
    raise exception using errcode = '22023', message = 'Home feed time is required.';
  end if;
  if length(coalesce(p_search_query, '')) > 200 then
    raise exception using errcode = '22023', message = 'Home search is too long.';
  end if;
  if p_cursor_id is not null and p_cursor_time_missing is distinct from (p_cursor_time is null) then
    raise exception using errcode = '22023', message = 'Invalid home cursor time.';
  end if;
  if p_cursor_distance is not null and p_cursor_distance < 0 then
    raise exception using errcode = '22023', message = 'Invalid home cursor distance.';
  end if;
  if p_cursor_id is not null and p_sort = 'nearest'
    and p_cursor_distance_missing is distinct from (p_cursor_distance is null) then
    raise exception using errcode = '22023', message = 'Invalid home cursor distance state.';
  end if;
  if p_sort = 'nearest' and (
    p_viewer_lat is null or p_viewer_lon is null
    or p_viewer_lat not between -90 and 90
    or p_viewer_lon not between -180 and 180
  ) then
    raise exception using errcode = '22023', message = 'A valid browse location is required for nearest sorting.';
  end if;

  search_needle := replace(replace(replace(btrim(coalesce(p_search_query, '')), '\', '\\'), '%', '\%'), '_', '\_');

  return query
  with eligible as (
    select
      q.id,
      q.creator_id,
      q.title::text,
      q.description::text,
      q.city::text,
      q.availability::text,
      q.starts_at,
      q.time_flexible,
      q.group_size::integer,
      q.hobby_id,
      q.skill_level::text,
      q.join_mode::text,
      q.created_at,
      q.media_items,
      case when h.id is null then null else jsonb_build_object('name', h.name, 'category', h.category) end as hobbies,
      case when profile.id is null then null else jsonb_build_object(
        'id', profile.id,
        'display_name', profile.display_name,
        'username', profile.username,
        'avatar_url', profile.avatar_url
      ) end as profiles,
      case
        when p_sort = 'nearest'
          and q.exact_location_visibility = 'public'
          and q.exact_lat between -90 and 90
          and q.exact_lng between -180 and 180
        then 3958.7613 * 2 * asin(sqrt(least(1::double precision,
          power(sin(radians(q.exact_lat - p_viewer_lat) / 2), 2)
          + cos(radians(p_viewer_lat)) * cos(radians(q.exact_lat))
          * power(sin(radians(q.exact_lng - p_viewer_lon) / 2), 2)
        )))
        else null
      end as sort_distance_miles
    from public.quests q
    left join public.hobbies h on h.id = q.hobby_id
    left join public.profiles profile on profile.id = q.creator_id
    where q.status in ('open', 'full')
      and (p_hobby_id is null or q.hobby_id = p_hobby_id)
      and (
        search_needle = ''
        or concat_ws(' ', q.title, q.description, q.city, q.availability, h.name, h.category, profile.display_name, profile.username)
          ilike ('%' || search_needle || '%') escape '\'
      )
  ), ranked as (
    select
      eligible.*,
      case
        when p_sort = 'recent' then eligible.created_at
        when eligible.starts_at is null then null
        when eligible.starts_at <= p_now then p_now
        else eligible.starts_at
      end as sort_time
    from eligible
  ), counted as (
    select ranked.*, ranked.sort_time is null as sort_time_missing, count(*) over () as total_count
    from ranked
  ), paged as (
    select counted.*
    from counted
    where p_cursor_id is null
      or (
        p_sort = 'soonest'
        and (
          (
            not p_cursor_time_missing
            and (
              counted.sort_time is null
              or counted.sort_time > p_cursor_time
              or (counted.sort_time = p_cursor_time and counted.id > p_cursor_id)
            )
          )
          or (
            p_cursor_time_missing
            and counted.sort_time is null
            and counted.id > p_cursor_id
          )
        )
      )
      or (
        p_sort = 'recent'
        and (
          (
            not p_cursor_time_missing
            and (
              counted.sort_time is null
              or counted.sort_time < p_cursor_time
              or (counted.sort_time = p_cursor_time and counted.id < p_cursor_id)
            )
          )
          or (
            p_cursor_time_missing
            and counted.sort_time is null
            and counted.id < p_cursor_id
          )
        )
      )
      or (
        p_sort = 'nearest'
        and (
          (
            not p_cursor_distance_missing
            and (
              counted.sort_distance_miles is null
              or counted.sort_distance_miles > p_cursor_distance
              or (
                counted.sort_distance_miles = p_cursor_distance
                and (
                  (
                    not p_cursor_time_missing
                    and (
                      counted.sort_time is null
                      or counted.sort_time > p_cursor_time
                      or (counted.sort_time = p_cursor_time and counted.id > p_cursor_id)
                    )
                  )
                  or (
                    p_cursor_time_missing
                    and counted.sort_time is null
                    and counted.id > p_cursor_id
                  )
                )
              )
            )
          )
          or (
            p_cursor_distance_missing
            and counted.sort_distance_miles is null
            and (
              (
                not p_cursor_time_missing
                and (
                  counted.sort_time is null
                  or counted.sort_time > p_cursor_time
                  or (counted.sort_time = p_cursor_time and counted.id > p_cursor_id)
                )
              )
              or (
                p_cursor_time_missing
                and counted.sort_time is null
                and counted.id > p_cursor_id
              )
            )
          )
        )
      )
  )
  select
    paged.id,
    paged.creator_id,
    paged.title,
    paged.description,
    paged.city,
    paged.availability,
    paged.starts_at,
    paged.time_flexible,
    paged.group_size,
    paged.hobby_id,
    paged.skill_level,
    paged.join_mode,
    paged.created_at,
    paged.media_items,
    paged.hobbies,
    paged.profiles,
    paged.sort_time,
    paged.sort_time_missing,
    paged.sort_distance_miles,
    paged.total_count
  from paged
  order by
    case when p_sort = 'soonest' then paged.sort_time_missing end asc,
    case when p_sort = 'soonest' then paged.sort_time end asc nulls last,
    case when p_sort = 'soonest' then paged.id end asc,
    case when p_sort = 'recent' then paged.sort_time_missing end asc,
    case when p_sort = 'recent' then paged.sort_time end desc nulls last,
    case when p_sort = 'recent' then paged.id end desc,
    case when p_sort = 'nearest' then paged.sort_distance_miles is null end asc,
    case when p_sort = 'nearest' then paged.sort_distance_miles end asc nulls last,
    case when p_sort = 'nearest' then paged.sort_time_missing end asc,
    case when p_sort = 'nearest' then paged.sort_time end asc nulls last,
    case when p_sort = 'nearest' then paged.id end asc
  limit p_limit;
end;
$$;

revoke all on function public.list_home_quests(text, text, uuid, double precision, double precision, timestamptz, boolean, double precision, boolean, uuid, integer, timestamptz) from public;
grant execute on function public.list_home_quests(text, text, uuid, double precision, double precision, timestamptz, boolean, double precision, boolean, uuid, integer, timestamptz) to anon, authenticated;

create index if not exists quests_home_active_soonest_idx on public.quests (starts_at asc, id asc)
  where status in ('open', 'full');
create index if not exists quests_home_active_recent_idx on public.quests (created_at desc, id desc)
  where status in ('open', 'full');
