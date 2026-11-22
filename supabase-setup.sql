-- =========================================================
-- GUILDCRAFT HALL — Supabase setup (accounts + guild data)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Run it ONCE on a fresh project.
--
-- Security model:
--   • Signed-in members can see everyone's crafter profiles and market listings.
--   • Each member can only edit their own crafter profile and listings.
--   • A craft request is only visible to the two people involved,
--     and only they can change or remove it.
--   • Admins (is_admin = true) can remove anyone's listings.
-- =========================================================

-- ---------- Profiles (one per account, created automatically) ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  base := regexp_replace(
    coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'user_name', 'crafter'),
    '[^A-Za-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'crafter_' || base; end if;
  base := left(base, 19);
  candidate := base;
  while exists (select 1 from profiles where lower(username) = lower(candidate)) loop
    candidate := base || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into profiles (id, username) values (new.id, candidate);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- ---------- Crafter profiles: characters, professions, known recipes ----------
-- chars looks like {"Thrall": {"profs": {"Alchemy": {"skill": 250, "known": [2330, 3170]}}}}
create table public.crafters (
  user_id     uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  chars       jsonb not null default '{}'::jsonb check (pg_column_size(chars) < 200000),
  note        text not null default '' check (char_length(note) <= 200),
  updated_at  timestamptz not null default now()
);

-- ---------- Craft and trade requests ----------
create table public.requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kind        text not null check (kind in ('craft', 'buy', 'sell')),
  recipe_id   integer,
  listing_id  bigint,
  label       text not null default '' check (char_length(label) <= 80),
  qty         integer not null default 1 check (qty between 1 and 9999),
  tip         numeric(12,2) not null default 0 check (tip >= 0),
  note        text not null default '' check (char_length(note) <= 140),
  from_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  from_char   text not null default '' check (char_length(from_char) <= 24),
  to_id       uuid not null references public.profiles(id) on delete cascade,
  to_char     text not null default '' check (char_length(to_char) <= 24),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'done', 'declined', 'cancelled'))
);
create index requests_from_idx on public.requests (from_id);
create index requests_to_idx on public.requests (to_id);

-- ---------- Guild market ----------
create table public.listings (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  seller_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  char        text not null check (char_length(char) between 1 and 24),
  type        text not null check (type in ('S', 'B')),
  item        text not null check (char_length(item) between 1 and 60),
  qty         integer not null default 1 check (qty between 1 and 9999),
  price       numeric(12,2) not null default 0 check (price >= 0),
  note        text not null default '' check (char_length(note) <= 140)
);

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.crafters enable row level security;
alter table public.requests enable row level security;
alter table public.listings enable row level security;

create policy "members read profiles" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select p.is_admin from profiles p where p.id = auth.uid()));

create policy "members read crafters" on public.crafters for select to authenticated using (true);
create policy "insert own crafter" on public.crafters for insert to authenticated with check (user_id = auth.uid());
create policy "update own crafter" on public.crafters for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own crafter" on public.crafters for delete to authenticated using (user_id = auth.uid());

create policy "see my requests" on public.requests for select to authenticated using (auth.uid() in (from_id, to_id));
create policy "send requests" on public.requests for insert to authenticated with check (from_id = auth.uid() and to_id <> auth.uid());
create policy "update my requests" on public.requests for update to authenticated
  using (auth.uid() in (from_id, to_id)) with check (auth.uid() in (from_id, to_id));
create policy "delete my requests" on public.requests for delete to authenticated using (auth.uid() in (from_id, to_id));

-- Only the status of a request may change after it's sent.
create or replace function public.requests_guard()
returns trigger language plpgsql as $$
begin
  if new.from_id <> old.from_id or new.to_id <> old.to_id or new.kind <> old.kind
     or new.qty <> old.qty or new.tip <> old.tip or new.label <> old.label then
    raise exception 'Only the status of a request can be changed.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger requests_guard before update on public.requests for each row execute function public.requests_guard();

create policy "members read listings" on public.listings for select to authenticated using (true);
create policy "post own listings" on public.listings for insert to authenticated with check (seller_id = auth.uid());
create policy "remove own listings" on public.listings for delete to authenticated using (seller_id = auth.uid() or public.is_admin());

-- ---------- Live updates ----------
alter publication supabase_realtime add table public.crafters, public.requests, public.listings;

-- ---------- Make yourself an admin (after creating your account on the site) ----------
-- update public.profiles set is_admin = true where username = 'YourUsername';
