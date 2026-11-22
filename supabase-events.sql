-- =========================================================
-- BARK AND STONE - Guild events with sign-ups (website and Discord), and price alerts
-- Run once, after supabase-discord.sql and supabase-guides.sql. Safe to re-run.
-- =========================================================

-- ---------- Events ----------
create table if not exists public.events (
  id                 bigint generated always as identity primary key,
  title              text not null check (char_length(title) between 3 and 80),
  kind               text not null default 'Dungeon' check (kind in ('Dungeon', 'Raid', 'Farming', 'Leveling', 'PvP', 'Social', 'Other')),
  starts_at          timestamptz not null,
  duration_min       int not null default 120 check (duration_min between 15 and 720),
  location           text not null default '' check (char_length(location) <= 80),
  size               int not null default 5 check (size between 2 and 40),
  note               text not null default '' check (char_length(note) <= 1000),
  host_name          text not null default '' check (char_length(host_name) <= 60),
  created_by         uuid default auth.uid() references auth.users on delete set null,
  created_by_discord text,
  cancelled          boolean not null default false,
  discord_channel_id text,
  discord_message_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists events_starts on public.events (starts_at);

create table if not exists public.event_signups (
  id          bigint generated always as identity primary key,
  event_id    bigint not null references public.events on delete cascade,
  user_id     uuid references auth.users on delete cascade,
  discord_id  text,
  name        text not null check (char_length(name) between 1 and 40),
  role        text not null default 'Damage' check (role in ('Tank', 'Healer', 'Damage')),
  status      text not null check (status in ('yes', 'maybe', 'no')),
  note        text not null default '' check (char_length(note) <= 100),
  joined_at   timestamptz not null default now(), -- when they last said "coming": first come, first in
  updated_at  timestamptz not null default now(),
  check (user_id is not null or discord_id is not null)
);
create unique index if not exists event_signups_user on public.event_signups (event_id, user_id) where user_id is not null;
create unique index if not exists event_signups_discord on public.event_signups (event_id, discord_id) where discord_id is not null and user_id is null;

alter table public.events enable row level security;
alter table public.event_signups enable row level security;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, delete on public.event_signups to authenticated;

drop policy if exists "anyone reads events" on public.events;
create policy "anyone reads events" on public.events for select using (true);
drop policy if exists "members plan events" on public.events;
create policy "members plan events" on public.events for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "host or admin edits events" on public.events;
create policy "host or admin edits events" on public.events for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (true);
drop policy if exists "host or admin deletes events" on public.events;
create policy "host or admin deletes events" on public.events for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "members read signups" on public.event_signups;
create policy "members read signups" on public.event_signups for select to authenticated using (true);
drop policy if exists "remove own signup" on public.event_signups;
create policy "remove own signup" on public.event_signups for delete to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid()));
-- Sign-ups are added and changed through event_rsvp() below.

-- Keep who made an event and when; the Discord message ids are only set by the bot.
-- (Runs as the caller, so current_user tells the website's members apart from the bot's functions.)
create or replace function private.events_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    new.created_by_discord := null; new.discord_channel_id := null; new.discord_message_id := null; new.cancelled := false;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by; new.created_by_discord := old.created_by_discord; new.created_at := old.created_at;
    if current_user in ('authenticated', 'anon') then
      new.discord_channel_id := old.discord_channel_id; new.discord_message_id := old.discord_message_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before insert or update on public.events for each row execute function private.events_touch();

-- The website's sign-up button: one row per member per event.
create or replace function public.event_rsvp(p_event bigint, p_status text, p_role text, p_name text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cur public.event_signups; ev public.events;
begin
  if me is null then raise exception 'Please sign in first.'; end if;
  select * into ev from events where id = p_event;
  if ev.id is null then raise exception 'That event is gone.'; end if;
  if ev.cancelled then raise exception 'That event was cancelled.'; end if;
  if p_status not in ('yes', 'maybe', 'no') then raise exception 'Bad answer.'; end if;
  if coalesce(p_role, '') not in ('Tank', 'Healer', 'Damage') then p_role := 'Damage'; end if;
  p_name := left(coalesce(nullif(trim(p_name), ''), (select username from profiles where id = me), 'Guildmate'), 40);
  select * into cur from event_signups where event_id = p_event and user_id = me;
  if cur.id is null then
    insert into event_signups (event_id, user_id, name, role, status, note) values (p_event, me, p_name, p_role, p_status, left(coalesce(p_note, ''), 100));
  else
    update event_signups set name = p_name, role = p_role, status = p_status, note = left(coalesce(p_note, ''), 100), updated_at = now(),
      joined_at = case when p_status = 'yes' and cur.status <> 'yes' then now() else joined_at end
    where id = cur.id;
  end if;
end $$;
grant execute on function public.event_rsvp(bigint, text, text, text, text) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.event_signups; exception when duplicate_object then null; end;
end $$;

-- ---------- The Discord bot's side (needs the bot's key, like bot_snapshot) ----------
alter table private.discord_config add column if not exists events_channel_id text not null default '';
alter table private.discord_config add column if not exists event_tz text not null default 'America/New_York';

create or replace function private.bot_check(p_key text) returns void
language plpgsql stable security definer set search_path = public, private, extensions as $$
declare want text;
begin
  select bot_key_hash into want from private.discord_config where id = 1;
  if want is null or want = '' or p_key is null or encode(extensions.digest(p_key, 'sha256'), 'hex') <> want then
    raise exception 'Not allowed.';
  end if;
end $$;

-- A Discord account counts as a guild member once they've linked it (or signed in with Discord) on the website.
create or replace function private.member_for_discord(p_discord text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select user_id from auth.identities where provider = 'discord' and provider_id = p_discord limit 1;
$$;

create or replace function private.event_json(p_event bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'title', e.title, 'kind', e.kind, 'starts_at', e.starts_at, 'duration_min', e.duration_min,
    'location', e.location, 'size', e.size, 'note', e.note, 'host_name', e.host_name, 'created_by', e.created_by, 'cancelled', e.cancelled,
    'discord_channel_id', e.discord_channel_id, 'discord_message_id', e.discord_message_id,
    'signups', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'role', s.role, 'status', s.status, 'member', s.user_id is not null,
                 'discord_id', s.discord_id, 'joined_at', s.joined_at) order by s.joined_at) from event_signups s where s.event_id = e.id), '[]'::jsonb))
  from events e where e.id = p_event;
$$;

create or replace function public.bot_config(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  return (select jsonb_build_object('events_channel', events_channel_id, 'tz', event_tz) from private.discord_config where id = 1);
end $$;

create or replace function public.bot_set_event_channel(p_key text, p_channel text, p_tz text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  if p_channel is not null and p_channel !~ '^[0-9]{5,25}$' then raise exception 'Bad channel.'; end if;
  if p_tz is not null and not exists (select 1 from pg_timezone_names where name = p_tz) then raise exception 'Unknown time zone.'; end if;
  update private.discord_config set events_channel_id = coalesce(p_channel, events_channel_id), event_tz = coalesce(p_tz, event_tz), updated_at = now() where id = 1;
end $$;

create or replace function public.bot_event_get(p_key text, p_event bigint) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  return private.event_json(p_event);
end $$;

create or replace function public.bot_events_upcoming(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  return coalesce((select jsonb_agg(private.event_json(id) order by starts_at) from
    (select id, starts_at from events where not cancelled and starts_at + make_interval(mins => duration_min) > now() order by starts_at limit 10) x), '[]'::jsonb);
end $$;

create or replace function public.bot_event_create(p_key text, p_title text, p_kind text, p_starts timestamptz, p_duration int,
  p_location text, p_size int, p_note text, p_discord text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare uid uuid; nid bigint; host text;
begin
  perform private.bot_check(p_key);
  uid := private.member_for_discord(p_discord);
  host := left(coalesce((select nullif(main_char, '') from profiles where id = uid), nullif(trim(p_name), ''), 'A guildmate'), 60);
  insert into events (title, kind, starts_at, duration_min, location, size, note, host_name, created_by, created_by_discord)
  values (left(trim(p_title), 80), coalesce(p_kind, 'Dungeon'), p_starts, coalesce(p_duration, 120), left(coalesce(p_location, ''), 80),
          coalesce(p_size, 5), left(coalesce(p_note, ''), 1000), host, uid, p_discord)
  returning id into nid;
  return private.event_json(nid);
end $$;

create or replace function public.bot_event_set_message(p_key text, p_event bigint, p_channel text, p_message text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.bot_check(p_key);
  update events set discord_channel_id = p_channel, discord_message_id = p_message where id = p_event;
end $$;

-- A button press in Discord. Linked members share one sign-up with the website; others sign up by their Discord name.
create or replace function public.bot_event_rsvp(p_key text, p_event bigint, p_discord text, p_name text, p_status text, p_role text,
  p_channel text default null, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare uid uuid; ev public.events; cur public.event_signups; nm text;
begin
  perform private.bot_check(p_key);
  select * into ev from events where id = p_event;
  if ev.id is null then raise exception 'That event is gone.'; end if;
  if ev.cancelled then raise exception 'That event was cancelled.'; end if;
  if p_status not in ('yes', 'maybe', 'no') then raise exception 'Bad answer.'; end if;
  if p_discord !~ '^[0-9]{5,25}$' then raise exception 'Bad Discord user.'; end if;
  uid := private.member_for_discord(p_discord);
  if uid is not null then
    select * into cur from event_signups where event_id = p_event and user_id = uid;
    nm := coalesce(cur.name, (select nullif(main_char, '') from profiles where id = uid), nullif(trim(p_name), ''), 'Guildmate');
  else
    select * into cur from event_signups where event_id = p_event and discord_id = p_discord and user_id is null;
    nm := coalesce(nullif(trim(p_name), ''), 'Discord member');
  end if;
  if coalesce(p_role, '') not in ('Tank', 'Healer', 'Damage') then p_role := coalesce(cur.role, 'Damage'); end if;
  if cur.id is null then
    insert into event_signups (event_id, user_id, discord_id, name, role, status) values (p_event, uid, p_discord, left(nm, 40), p_role, p_status);
  else
    update event_signups set discord_id = p_discord, role = p_role, status = p_status, updated_at = now(),
      joined_at = case when p_status = 'yes' and cur.status <> 'yes' then now() else joined_at end
    where id = cur.id;
  end if;
  if p_message is not null and ev.discord_message_id is null then
    update events set discord_channel_id = p_channel, discord_message_id = p_message where id = p_event;
  end if;
  return private.event_json(p_event);
end $$;

grant execute on function public.bot_config(text) to anon, authenticated;
grant execute on function public.bot_set_event_channel(text, text, text) to anon, authenticated;
grant execute on function public.bot_event_get(text, bigint) to anon, authenticated;
grant execute on function public.bot_events_upcoming(text) to anon, authenticated;
grant execute on function public.bot_event_create(text, text, text, timestamptz, int, text, int, text, text, text) to anon, authenticated;
grant execute on function public.bot_event_set_message(text, bigint, text, text) to anon, authenticated;
grant execute on function public.bot_event_rsvp(text, bigint, text, text, text, text, text, text) to anon, authenticated;

-- ---------- Price alerts: each member's own ----------
create table if not exists public.price_alerts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  item        text not null check (char_length(item) between 1 and 60),
  below       numeric(14,4) check (below > 0),
  above       numeric(14,4) check (above > 0),
  created_at  timestamptz not null default now(),
  check (below is not null or above is not null)
);
alter table public.price_alerts enable row level security;
grant select, insert, delete on public.price_alerts to authenticated;
drop policy if exists "own price alerts" on public.price_alerts;
create policy "own price alerts" on public.price_alerts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- New accounts from "Sign in with Discord" get their Discord name as a username ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; candidate text;
begin
  base := regexp_replace(coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->'custom_claims'->>'global_name',
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'user_name', new.raw_user_meta_data->>'name', 'crafter'), '[^A-Za-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'crafter_' || base; end if;
  base := left(base, 19);
  candidate := base;
  while exists (select 1 from profiles where lower(username) = lower(candidate)) loop
    candidate := base || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into profiles (id, username) values (new.id, candidate);
  return new;
end $$;

select (select count(*) from public.events) as events, (select count(*) from public.price_alerts) as alerts;
