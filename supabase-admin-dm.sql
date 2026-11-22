-- =========================================================
-- BARK AND STONE — guild ranks, admin tools, private messages, site settings
-- Run once, after the other supabase-*.sql files. Safe to re-run.
-- =========================================================

-- ---------- Guild ranks (set by admins on the Admin page) ----------
alter table public.profiles
  add column if not exists guild_rank text not null default 'Initiate'
  check (guild_rank in ('Thane', 'Archdruid', 'Backburner', 'Officer', 'Clansfolk', 'Initiate'));

-- Admins can change any member's rank and admin flag.
drop policy if exists "admins manage members" on public.profiles;
create policy "admins manage members" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Members can still edit their own profile, but only admins may change rank or admin status.
-- (Run from the SQL editor, auth.uid() is empty, so the site owner can always fix things there.)
create or replace function public.profile_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.guild_rank is distinct from old.guild_rank or new.is_admin is distinct from old.is_admin) then
    raise exception 'Only guild admins can change ranks or admin status.';
  end if;
  return new;
end $$;
drop trigger if exists profile_guard on public.profiles;
create trigger profile_guard before update on public.profiles for each row execute function public.profile_guard();

-- ---------- Private messages between two members ----------
create table if not exists public.direct_messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists dm_recipient on public.direct_messages (recipient_id, created_at desc);
create index if not exists dm_sender on public.direct_messages (sender_id, created_at desc);
alter table public.direct_messages enable row level security;

-- Only the two people in a conversation can see it. Admins can't read private messages.
drop policy if exists "read my dms" on public.direct_messages;
create policy "read my dms" on public.direct_messages for select to authenticated using (auth.uid() in (sender_id, recipient_id));
drop policy if exists "send dms" on public.direct_messages;
create policy "send dms" on public.direct_messages for insert to authenticated with check (sender_id = auth.uid() and recipient_id <> auth.uid());
drop policy if exists "mark dms read" on public.direct_messages;
create policy "mark dms read" on public.direct_messages for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists "delete own dms" on public.direct_messages;
create policy "delete own dms" on public.direct_messages for delete to authenticated using (sender_id = auth.uid());

-- The recipient may only mark a message read, not change what it says.
create or replace function public.dm_guard() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id or new.created_at is distinct from old.created_at then
    raise exception 'Messages can''t be edited.';
  end if;
  return new;
end $$;
drop trigger if exists dm_guard on public.direct_messages;
create trigger dm_guard before update on public.direct_messages for each row execute function public.dm_guard();

grant select, insert, update, delete on public.direct_messages to authenticated;

-- ---------- Site settings (announcement on the home page, Discord invite) ----------
create table if not exists public.site_settings (
  key        text primary key check (key in ('announcement', 'discord_invite')),
  value      text not null default '' check (char_length(value) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "anyone reads settings" on public.site_settings;
create policy "anyone reads settings" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "admins write settings" on public.site_settings;
create policy "admins write settings" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

-- ---------- Live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.site_settings; exception when duplicate_object then null; end;
end $$;

-- Members who were already here count as full members; new sign-ups start as Initiates.
update public.profiles set guild_rank = 'Clansfolk' where guild_rank = 'Initiate' and created_at < now() - interval '1 minute';
