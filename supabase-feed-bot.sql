-- =========================================================
-- BARK AND STONE - Feed posts sent by the bot itself (no webhook, no Discord admin needed).
-- A website admin picks the feed and events channels on the Admin page. Run after supabase-feed.sql. Safe to re-run.
-- =========================================================
create table if not exists private.discord_outbox (
  id         bigint generated always as identity primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
alter table private.discord_outbox enable row level security;

-- Webhook if one is saved; otherwise the bot posts in the feed channel picked on the Admin page.
create or replace function private.discord_post(payload jsonb) returns void
language plpgsql security definer set search_path = public, private, extensions as $$
declare url text; ch text; nid bigint;
begin
  select webhook_url, feed_channel_id into url, ch from private.discord_config where id = 1;
  payload := payload || jsonb_build_object('allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)); -- no pings
  if coalesce(url, '') <> '' then
    perform net.http_post(url := url, body := payload);
  elsif coalesce(ch, '') <> '' then
    insert into private.discord_outbox (payload) values (payload - 'username') returning id into nid;
    perform net.http_post(url := 'https://guildcraft-hall.netlify.app/.netlify/functions/feed-post', body := jsonb_build_object('id', nid));
  end if;
  delete from private.discord_outbox where created_at < now() - interval '7 days';
exception when others then
  raise warning 'Discord post failed: %', sqlerrm; -- never block the website because Discord is down
end $$;

-- The site's feed-post function collects a waiting post (once) to send with the bot.
create or replace function public.bot_outbox_take(p_key text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare r private.discord_outbox; ch text;
begin
  perform private.bot_check(p_key);
  update private.discord_outbox set sent_at = now() where id = p_id and sent_at is null and created_at > now() - interval '15 minutes'
    returning * into r;
  if r.id is null then return null; end if;
  select feed_channel_id into ch from private.discord_config where id = 1;
  return jsonb_build_object('channel', ch, 'payload', r.payload);
end $$;
grant execute on function public.bot_outbox_take(text, bigint) to anon, authenticated;

-- Admin page → Discord bot → Channels (the site checks the caller is a guild admin before calling this).
create or replace function public.bot_set_channels(p_key text, p_feed text, p_events text, p_tz text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  if p_feed is not null and p_feed <> '' and p_feed !~ '^[0-9]{5,25}$' then raise exception 'Bad channel.'; end if;
  if p_events is not null and p_events <> '' and p_events !~ '^[0-9]{5,25}$' then raise exception 'Bad channel.'; end if;
  if p_tz is not null and not exists (select 1 from pg_timezone_names where name = p_tz) then raise exception 'Unknown time zone.'; end if;
  update private.discord_config set
    feed_channel_id = coalesce(p_feed, feed_channel_id),
    webhook_url = case when p_feed is not null then '' else webhook_url end, -- the bot posts instead of a webhook
    events_channel_id = coalesce(p_events, events_channel_id),
    event_tz = coalesce(p_tz, event_tz), updated_at = now()
  where id = 1;
end $$;
grant execute on function public.bot_set_channels(text, text, text, text) to anon, authenticated;

create or replace function public.bot_config(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  return (select jsonb_build_object('events_channel', events_channel_id, 'tz', event_tz, 'feed_channel', feed_channel_id, 'feed_webhook', webhook_url <> '')
          from private.discord_config where id = 1);
end $$;

select 'bot feed ready' as status;

-- "Send a test message" works with either a webhook or the bot's feed channel.
create or replace function public.discord_test() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Only guild admins can send a test message.'; end if;
  if (select webhook_url = '' and feed_channel_id = '' from private.discord_config where id = 1) then raise exception 'Pick a feed channel first.'; end if;
  perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
    'title', 'The hall is connected', 'url', 'https://guildcraft-hall.netlify.app/',
    'description', 'New market listings, Request Board jobs, guild news, guides, events and new members from the Bark and Stone website will be posted in this channel.',
    'color', 14923099))));
end $$;
