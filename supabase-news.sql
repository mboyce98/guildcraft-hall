-- =========================================================
-- BARK AND STONE - guild news feed on the home page (admins post, everyone reads)
-- Run once, after supabase-admin-dm.sql. Safe to re-run.
-- =========================================================
create table if not exists public.guild_news (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 1500),
  tag        text not null default 'News' check (tag in ('News', 'Coming soon', 'Event', 'Update')),
  pinned     boolean not null default false,
  author_id  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.guild_news enable row level security;
drop policy if exists "anyone reads guild news" on public.guild_news;
create policy "anyone reads guild news" on public.guild_news for select to anon, authenticated using (true);
drop policy if exists "admins write guild news" on public.guild_news;
create policy "admins write guild news" on public.guild_news for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.guild_news to anon, authenticated;
grant insert, update, delete on public.guild_news to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.guild_news; exception when duplicate_object then null; end;
end $$;

-- First two posts (only added if the feed is empty).
insert into public.guild_news (title, body, tag, pinned)
select * from (values
  ('Our guild tabard is coming soon',
   'The Bark and Stone tabard is on its way. Once the design is settled and the guild has it, every member will be able to wear our colours. The design reveal will be posted here first, so keep an eye on this feed.',
   'Coming soon', true),
  ('A guild bank, eventually',
   'Down the track we''re planning a guild bank, so crafters can share materials and members can borrow what they need for their next craft or upgrade. Until then, use the Request Board and Market on this site to trade mats with each other.',
   'Coming soon', false)
) as v(title, body, tag, pinned)
where not exists (select 1 from public.guild_news);

select id, title, tag, pinned from public.guild_news order by pinned desc, created_at desc;
