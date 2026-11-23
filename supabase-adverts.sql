-- =========================================================
-- BARK AND STONE - Merchant Row adverts: members pick a merchant character and advertise their shop,
-- crafting or services on the Market, Recipes, Request Board and Requests pages.
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- =========================================================
create table if not exists public.adverts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  model       text not null check (model in ('rowan', 'maren', 'thorek', 'brannoc', 'zulana')),
  title       text not null check (char_length(title) between 2 and 40),
  body        text not null check (char_length(body) between 2 and 160),
  kind        text not null default 'shop' check (kind in ('shop', 'craft', 'service', 'wanted')),
  link        text not null default 'market' check (link in ('market', 'recipes', 'board', 'messages')),
  char        text not null default '' check (char_length(char) <= 24),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days' check (expires_at <= now() + interval '15 days')
);
create index if not exists adverts_live_idx on public.adverts (expires_at);
alter table public.adverts enable row level security;
grant select, insert, delete on public.adverts to authenticated;
grant usage on sequence public.adverts_id_seq to authenticated;

drop policy if exists "guild sees adverts" on public.adverts;
create policy "guild sees adverts" on public.adverts for select to authenticated using (true);
-- Members post their own, at most 2 running at once.
drop policy if exists "post own adverts" on public.adverts;
create policy "post own adverts" on public.adverts for insert to authenticated with check (
  user_id = auth.uid()
  and (select count(*) from public.adverts a where a.user_id = auth.uid() and a.expires_at > now()) < 2);
drop policy if exists "remove own adverts" on public.adverts;
create policy "remove own adverts" on public.adverts for delete to authenticated using (user_id = auth.uid() or public.is_admin());

select 'adverts ready' as status;
