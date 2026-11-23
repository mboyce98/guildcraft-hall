-- =========================================================
-- BARK AND STONE - Transmog wardrobe: outfits members plan and share with the guild.
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- items looks like {"head": 12345, "chest": 6789, ...} (Wowhead item IDs by slot).
-- =========================================================
create table if not exists public.transmog_outfits (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  class       text not null default '' check (char_length(class) <= 20),
  armor       text not null default '' check (armor in ('', 'Cloth', 'Leather', 'Mail', 'Plate')),
  items       jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object' and pg_column_size(items) < 4000),
  note        text not null default '' check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists transmog_outfits_user_idx on public.transmog_outfits (user_id);
alter table public.transmog_outfits enable row level security;
grant select, insert, update, delete on public.transmog_outfits to authenticated;
grant usage on sequence public.transmog_outfits_id_seq to authenticated;

drop policy if exists "guild sees outfits" on public.transmog_outfits;
create policy "guild sees outfits" on public.transmog_outfits for select to authenticated using (true);
drop policy if exists "own outfits" on public.transmog_outfits;
create policy "own outfits" on public.transmog_outfits for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "edit own outfits" on public.transmog_outfits;
create policy "edit own outfits" on public.transmog_outfits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "remove own outfits" on public.transmog_outfits;
create policy "remove own outfits" on public.transmog_outfits for delete to authenticated using (user_id = auth.uid() or public.is_admin());

select 'transmog outfits ready' as status;
