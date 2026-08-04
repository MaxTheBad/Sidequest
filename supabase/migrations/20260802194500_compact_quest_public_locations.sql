do $$
declare
  quest_row record;
  state_names text[] := array[
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia',
    'Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland',
    'Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
    'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina',
    'South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','District of Columbia'
  ];
  state_codes text[] := array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ];
  address_parts text[];
  country_name text;
  compact_suffix text;
  state_index integer;
begin
  for quest_row in
    select id, city, exact_address
    from public.quests
    where city is not null
      and btrim(city) <> ''
      and exact_address is not null
      and btrim(exact_address) <> ''
      and city !~ ',\s*(?:[A-Z]{2}|[A-Z][a-z]{2})$'
      and lower(city) <> 'virtual'
  loop
    address_parts := regexp_split_to_array(quest_row.exact_address, '\s*,\s*');
    country_name := btrim(address_parts[array_length(address_parts, 1)]);
    compact_suffix := null;

    if country_name ~* '^United States(?: of America)?$' then
      for state_index in 1..array_length(state_names, 1) loop
        if quest_row.exact_address ~* ('(^|,\s*)' || state_names[state_index] || '(\s+\d{5}(?:-\d{4})?)?(\s*,|$)') then
          compact_suffix := state_codes[state_index];
          exit;
        end if;
      end loop;
    elsif country_name ~ '^[[:alpha:] .''-]+$' then
      compact_suffix := initcap(left(regexp_replace(country_name, '[^[:alpha:]]', '', 'g'), 3));
    end if;

    if compact_suffix is not null and compact_suffix <> '' then
      update public.quests
      set city = split_part(city, ',', 1) || ', ' || compact_suffix
      where id = quest_row.id;
    end if;
  end loop;
end
$$;
