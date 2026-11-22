-- =========================================================
-- BARK AND STONE - prices down to the copper (1g = 100s = 10,000c, stored in gold with 4 decimals)
-- Run once, after supabase-discord.sql. Safe to re-run. Existing prices keep their value.
-- =========================================================
alter table public.listings    alter column price type numeric(14,4);
alter table public.requests    alter column tip   type numeric(14,4);
alter table public.board_posts alter column offer type numeric(14,4);

-- "1g 25s 50c" for Discord posts.
create or replace function private.coins(g numeric) returns text language sql immutable as $$
  select case when coalesce(g, 0) <= 0 then null else trim(concat_ws(' ',
    nullif(floor(round(g * 10000) / 10000)::bigint, 0) || 'g',
    nullif(floor(mod(round(g * 10000), 10000) / 100)::int, 0) || 's',
    nullif(mod(round(g * 10000), 100)::int, 0) || 'c')) end
$$;

create or replace function private.discord_on_board() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (select announce_board from private.discord_config where id = 1) then
    perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', 'New on the Request Board'),
      'title', left(new.title, 200) || ' ×' || new.qty, 'url', 'https://guildcraft-hall.netlify.app/#board',
      'description', nullif(left(new.note, 500), ''),
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'Posted by', 'value', coalesce(nullif(new.author_char, ''), 'A guild member'), 'inline', true),
        jsonb_build_object('name', 'Offer', 'value', coalesce(private.coins(new.offer), 'None set'), 'inline', true)),
      'footer', jsonb_build_object('text', 'Anyone in the guild can take this job on the website'),
      'color', 5214940))));
  end if;
  return new;
end $$;

create or replace function private.discord_on_listing() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (select announce_market from private.discord_config where id = 1) then
    perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', case when new.type = 'S' then 'For sale on the guild market' else 'Wanted on the guild market' end),
      'title', left(new.item, 200) || ' ×' || new.qty, 'url', 'https://guildcraft-hall.netlify.app/#market',
      'description', nullif(left(new.note, 500), ''),
      'fields', jsonb_build_array(
        jsonb_build_object('name', case when new.type = 'S' then 'Seller' else 'Buyer' end, 'value', new.char, 'inline', true),
        jsonb_build_object('name', 'Price each', 'value', coalesce(private.coins(new.price), 'Open to offers'), 'inline', true)),
      'color', case when new.type = 'S' then 6280830 else 7124223 end))));
  end if;
  return new;
end $$;

select private.coins(1.255) as example_1g_25s_50c, private.coins(0.0007) as example_7c;
