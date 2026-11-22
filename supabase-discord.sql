-- =========================================================
-- BARK AND STONE - Discord: channel announcements and the bot's read-only view of guild data
-- Run once, after supabase-news.sql. Safe to re-run.
-- =========================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private settings: nobody reaches this schema through the website's API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.discord_config (
  id              int primary key default 1 check (id = 1),
  webhook_url     text not null default '',
  announce_news   boolean not null default true,
  announce_board  boolean not null default true,
  announce_market boolean not null default true,
  bot_key_hash    text not null default '',
  updated_at      timestamptz not null default now()
);
insert into private.discord_config (id) values (1) on conflict do nothing;
alter table private.discord_config enable row level security; -- only the functions below (run as the owner) touch it

-- ---------- Admin page: read and change the Discord settings ----------
create or replace function public.discord_config_get() returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare c private.discord_config;
begin
  if not public.is_admin() then raise exception 'Only guild admins can see the Discord settings.'; end if;
  select * into c from private.discord_config where id = 1;
  return jsonb_build_object('webhook_set', c.webhook_url <> '', 'news', c.announce_news, 'board', c.announce_board,
                            'market', c.announce_market, 'bot_linked', c.bot_key_hash <> '');
end $$;

create or replace function public.discord_config_set(p_webhook text, p_news boolean, p_board boolean, p_market boolean) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Only guild admins can change the Discord settings.'; end if;
  if p_webhook is not null and p_webhook <> '' and p_webhook !~ '^https://(canary\.|ptb\.)?(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' then
    raise exception 'That doesn''t look like a Discord webhook link. It should start with https://discord.com/api/webhooks/';
  end if;
  update private.discord_config set
    webhook_url = coalesce(p_webhook, webhook_url),
    announce_news = coalesce(p_news, announce_news), announce_board = coalesce(p_board, announce_board),
    announce_market = coalesce(p_market, announce_market), updated_at = now()
  where id = 1;
end $$;

-- The site's Discord function stores a fingerprint of the bot's data key here (admins only).
create or replace function public.discord_set_bot_key(p_hash text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Only guild admins can link the bot.'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Bad key.'; end if;
  update private.discord_config set bot_key_hash = p_hash, updated_at = now() where id = 1;
end $$;

-- ---------- Posting to the Discord channel ----------
create or replace function private.discord_post(payload jsonb) returns void
language plpgsql security definer set search_path = public, private, extensions as $$
declare url text;
begin
  select webhook_url into url from private.discord_config where id = 1;
  if url is null or url = '' then return; end if;
  -- No pings: a post titled "@everyone" stays plain text.
  perform net.http_post(url := url, body := payload || jsonb_build_object('allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)));
exception when others then
  raise warning 'Discord post failed: %', sqlerrm; -- never block the website because Discord is down
end $$;

create or replace function public.discord_test() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Only guild admins can send a test message.'; end if;
  if (select webhook_url from private.discord_config where id = 1) = '' then raise exception 'Save a webhook link first.'; end if;
  perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
    'title', 'The hall is connected', 'url', 'https://guildcraft-hall.netlify.app/',
    'description', 'New guild news, Request Board jobs and market listings from the Bark and Stone website will be posted in this channel.',
    'color', 14923099))));
end $$;

grant execute on function public.discord_config_get() to authenticated;
grant execute on function public.discord_config_set(text, boolean, boolean, boolean) to authenticated;
grant execute on function public.discord_set_bot_key(text) to authenticated;
grant execute on function public.discord_test() to authenticated;

-- ---------- Announcements when things are posted on the site ----------
create or replace function private.discord_on_news() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (select announce_news from private.discord_config where id = 1) then
    perform private.discord_post(jsonb_build_object('username', 'Bark and Stone', 'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', 'Guild news · ' || new.tag),
      'title', left(new.title, 250), 'url', 'https://guildcraft-hall.netlify.app/#home',
      'description', left(new.body, 1500), 'color', 14923099))));
  end if;
  return new;
end $$;
drop trigger if exists discord_news on public.guild_news;
create trigger discord_news after insert on public.guild_news for each row execute function private.discord_on_news();

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
        jsonb_build_object('name', 'Offer', 'value', case when new.offer > 0 then trim(to_char(new.offer, 'FM999999990.##')) || 'g' else 'None set' end, 'inline', true)),
      'footer', jsonb_build_object('text', 'Anyone in the guild can take this job on the website'),
      'color', 5214940))));
  end if;
  return new;
end $$;
drop trigger if exists discord_board on public.board_posts;
create trigger discord_board after insert on public.board_posts for each row execute function private.discord_on_board();

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
        jsonb_build_object('name', 'Price', 'value', case when new.price > 0 then trim(to_char(new.price, 'FM999999990.##')) || 'g' else 'Ask' end, 'inline', true)),
      'color', case when new.type = 'S' then 6280830 else 7124223 end))));
  end if;
  return new;
end $$;
drop trigger if exists discord_listing on public.listings;
create trigger discord_listing after insert on public.listings for each row execute function private.discord_on_listing();

-- ---------- The bot's read-only view of guild data (needs the bot's key) ----------
create or replace function public.bot_snapshot(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, private, extensions as $$
declare want text;
begin
  select bot_key_hash into want from private.discord_config where id = 1;
  if want is null or want = '' or p_key is null or encode(extensions.digest(p_key, 'sha256'), 'hex') <> want then
    raise exception 'Not allowed.';
  end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'username', username, 'char', main_char, 'surname', main_realm,
                  'cls', main_class, 'level', main_level, 'rank', guild_rank, 'bio', bio, 'times', play_times)), '[]') from profiles),
    'crafters', (select coalesce(jsonb_agg(jsonb_build_object('uid', user_id, 'chars', chars)), '[]') from crafters),
    'board', (select coalesce(jsonb_agg(x), '[]') from (select title, qty, offer, author_char, claimer_char, status, created_at
                  from board_posts where status in ('open', 'claimed') order by created_at desc limit 25) x),
    'listings', (select coalesce(jsonb_agg(x), '[]') from (select type, item, qty, price, char, note, created_at
                  from listings order by created_at desc limit 100) x),
    'news', (select coalesce(jsonb_agg(x), '[]') from (select title, body, tag, pinned, created_at
                  from guild_news order by pinned desc, created_at desc limit 5) x));
end $$;
grant execute on function public.bot_snapshot(text) to anon, authenticated;

select 'discord ready' as status;
