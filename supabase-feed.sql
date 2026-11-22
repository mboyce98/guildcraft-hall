-- =========================================================
-- BARK AND STONE - Discord feed channel: "/feedchannel" marks a channel for new market posts, board jobs,
-- guild news, guides, events and new members. Run after supabase-events.sql. Safe to re-run.
-- =========================================================
alter table private.discord_config add column if not exists announce_guides  boolean not null default true;
alter table private.discord_config add column if not exists announce_events  boolean not null default true;
alter table private.discord_config add column if not exists announce_members boolean not null default true;
alter table private.discord_config add column if not exists feed_channel_id  text not null default '';

create or replace function public.discord_config_get() returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare c private.discord_config;
begin
  if not public.is_admin() then raise exception 'Only guild admins can see the Discord settings.'; end if;
  select * into c from private.discord_config where id = 1;
  return jsonb_build_object('webhook_set', c.webhook_url <> '', 'news', c.announce_news, 'board', c.announce_board,
    'market', c.announce_market, 'guides', c.announce_guides, 'events', c.announce_events, 'members', c.announce_members,
    'feed_channel', c.feed_channel_id, 'bot_linked', c.bot_key_hash <> '');
end $$;

drop function if exists public.discord_config_set(text, boolean, boolean, boolean);
create or replace function public.discord_config_set(p_webhook text, p_news boolean, p_board boolean, p_market boolean,
  p_guides boolean default null, p_events boolean default null, p_members boolean default null) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Only guild admins can change the Discord settings.'; end if;
  if p_webhook is not null and p_webhook <> '' and p_webhook !~ '^https://(canary\.|ptb\.)?(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' then
    raise exception 'That doesn''t look like a Discord webhook link. It should start with https://discord.com/api/webhooks/';
  end if;
  update private.discord_config set
    webhook_url = coalesce(p_webhook, webhook_url),
    feed_channel_id = case when p_webhook is not null then '' else feed_channel_id end,
    announce_news = coalesce(p_news, announce_news), announce_board = coalesce(p_board, announce_board),
    announce_market = coalesce(p_market, announce_market), announce_guides = coalesce(p_guides, announce_guides),
    announce_events = coalesce(p_events, announce_events), announce_members = coalesce(p_members, announce_members), updated_at = now()
  where id = 1;
end $$;
grant execute on function public.discord_config_set(text, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- The bot's /feedchannel command makes a webhook in that channel and saves it here.
create or replace function public.bot_set_feed(p_key text, p_url text, p_channel text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  if p_url !~ '^https://(canary\.|ptb\.)?(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' then raise exception 'Bad webhook.'; end if;
  if p_channel !~ '^[0-9]{5,25}$' then raise exception 'Bad channel.'; end if;
  update private.discord_config set webhook_url = p_url, feed_channel_id = p_channel, updated_at = now() where id = 1;
end $$;
grant execute on function public.bot_set_feed(text, text, text) to anon, authenticated;

-- ---------- More announcements ----------
create or replace function private.discord_on_guide() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (select announce_guides from private.discord_config where id = 1) then
    perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', 'New guide · ' || new.category),
      'title', left(new.title, 200), 'url', 'https://guildcraft-hall.netlify.app/#guide-' || new.id,
      'description', nullif(concat_ws(' · ', nullif(new.zone, ''),
        case when new.level_min is not null or new.level_max is not null then 'levels ' || coalesce(new.level_min::text, '?') || '-' || coalesce(new.level_max::text, '?') end), ''),
      'footer', jsonb_build_object('text', 'By ' || coalesce((select username from profiles where id = new.author_id), 'a guildmate')),
      'color', 14923099))));
  end if;
  return new;
end $$;
drop trigger if exists discord_guide on public.guides;
create trigger discord_guide after insert on public.guides for each row execute function private.discord_on_guide();

-- Events go here only when they aren't already posted in an events channel by the bot.
create or replace function private.discord_on_event() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (select announce_events and not (feed_channel_id <> '' and events_channel_id = feed_channel_id) from private.discord_config where id = 1) then
    perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', 'New guild event · ' || new.kind),
      'title', left(new.title, 200), 'url', 'https://guildcraft-hall.netlify.app/#event-' || new.id,
      'description', '<t:' || floor(extract(epoch from new.starts_at))::bigint || ':F> (<t:' || floor(extract(epoch from new.starts_at))::bigint || ':R>)'
        || case when new.location <> '' then E'\n' || new.location else '' end,
      'footer', jsonb_build_object('text', new.size || ' spots · sign up in the events channel or on the website'),
      'color', 5214940))));
  end if;
  return new;
end $$;
drop trigger if exists discord_event on public.events;
create trigger discord_event after insert on public.events for each row execute function private.discord_on_event();

create or replace function private.discord_on_member() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (select announce_members from private.discord_config where id = 1) then
    perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
      'title', 'Welcome, ' || left(new.username, 40) || '!', 'url', 'https://guildcraft-hall.netlify.app/#member-' || new.id,
      'description', 'A new member joined the Bark and Stone website.', 'color', 6280830))));
  end if;
  return new;
end $$;
drop trigger if exists discord_member on public.profiles;
create trigger discord_member after insert on public.profiles for each row execute function private.discord_on_member();

-- Market posts show the price in gold, silver and copper, like the website.
create or replace function private.coins(g numeric) returns text
language sql immutable as $$
  select case when coalesce(g, 0) <= 0 then 'Ask' else concat_ws(' ',
    nullif(floor(round(g * 10000) / 10000)::bigint, 0) || 'g',
    nullif(floor(mod(round(g * 10000), 10000) / 100)::bigint, 0) || 's',
    nullif(mod(round(g * 10000), 100)::bigint, 0) || 'c') end;
$$;
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
        jsonb_build_object('name', 'Price each', 'value', private.coins(new.price), 'inline', true)),
      'color', case when new.type = 'S' then 6280830 else 7124223 end))));
  end if;
  return new;
end $$;

select 'feed ready' as status;
