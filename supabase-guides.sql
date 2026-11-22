-- =========================================================
-- BARK AND STONE - guild guides, market price tracking, and the AI helper's daily limit
-- Run once, after supabase-coins.sql. Safe to re-run.
-- =========================================================

-- ---------- Guides written by guild members ----------
create table if not exists public.guides (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 3 and 100),
  category   text not null default 'Other' check (category in ('Gathering', 'Questing', 'Market', 'Dungeons', 'Other')),
  zone       text not null default '' check (char_length(zone) <= 60),
  level_min  int check (level_min between 1 and 60),
  level_max  int check (level_max between 1 and 60),
  body       text not null default '' check (char_length(body) <= 10000),
  author_id  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.guides enable row level security;
drop policy if exists "anyone reads guides" on public.guides;
create policy "anyone reads guides" on public.guides for select to anon, authenticated using (true);
drop policy if exists "members write guides" on public.guides;
create policy "members write guides" on public.guides for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "authors or admins edit guides" on public.guides;
create policy "authors or admins edit guides" on public.guides for update to authenticated
  using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
drop policy if exists "authors or admins delete guides" on public.guides;
create policy "authors or admins delete guides" on public.guides for delete to authenticated using (author_id = auth.uid() or public.is_admin());
grant select on public.guides to anon, authenticated;
grant insert, update, delete on public.guides to authenticated;

create or replace function private.guides_touch() returns trigger language plpgsql security definer set search_path = public, private as $$
begin new.updated_at := now(); new.author_id := old.author_id; new.created_at := old.created_at; return new; end $$;
drop trigger if exists guides_touch on public.guides;
create trigger guides_touch before update on public.guides for each row execute function private.guides_touch();

-- ---------- Prices seen in trade (members report them; market listings add them automatically) ----------
create table if not exists public.price_points (
  id          bigint generated always as identity primary key,
  item        text not null check (char_length(item) between 1 and 60),
  price       numeric(14,4) not null check (price > 0 and price < 1000000),  -- gold per single item
  source      text not null default 'Trade chat' check (source in ('Trade chat', 'Auction house', 'Guild market', 'Vendor')),
  reporter_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists price_points_item on public.price_points (lower(item), created_at desc);
alter table public.price_points enable row level security;
drop policy if exists "anyone reads prices" on public.price_points;
create policy "anyone reads prices" on public.price_points for select to anon, authenticated using (true);
drop policy if exists "members report prices" on public.price_points;
create policy "members report prices" on public.price_points for insert to authenticated
  with check (reporter_id = auth.uid() and source <> 'Guild market');
drop policy if exists "reporters or admins remove prices" on public.price_points;
create policy "reporters or admins remove prices" on public.price_points for delete to authenticated using (reporter_id = auth.uid() or public.is_admin());
grant select on public.price_points to anon, authenticated;
grant insert, delete on public.price_points to authenticated;

-- Every priced "For sale" listing on the guild market counts as a price point too.
create or replace function private.price_from_listing() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.type = 'S' and new.price > 0 then
    insert into public.price_points (item, price, source, reporter_id) values (new.item, new.price, 'Guild market', new.seller_id);
  end if;
  return new;
end $$;
drop trigger if exists price_from_listing on public.listings;
create trigger price_from_listing after insert on public.listings for each row execute function private.price_from_listing();

do $$ begin
  begin alter publication supabase_realtime add table public.guides; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.price_points; exception when duplicate_object then null; end;
end $$;

-- ---------- The AI helper: 30 questions per member per day ----------
create table if not exists private.ai_usage (
  user_id uuid not null,
  day     date not null default current_date,
  n       int not null default 0,
  primary key (user_id, day)
);
alter table private.ai_usage enable row level security;

create or replace function public.ai_take_turn() returns int
language plpgsql security definer set search_path = public, private as $$
declare used int;
begin
  if auth.uid() is null then raise exception 'Sign in to ask the guild helper.'; end if;
  insert into private.ai_usage (user_id, day, n) values (auth.uid(), current_date, 1)
    on conflict (user_id, day) do update set n = private.ai_usage.n + 1
    returning n into used;
  if used > 30 then raise exception 'You''ve asked 30 questions today. The helper is back tomorrow.'; end if;
  delete from private.ai_usage where day < current_date - 7;
  return 30 - used;
end $$;
revoke all on function public.ai_take_turn() from public, anon;
grant execute on function public.ai_take_turn() to authenticated;

-- ---------- Starter guides (only added if there are none yet) ----------
insert into public.guides (title, category, zone, level_min, level_max, body, author_id)
select v.title, v.category, v.zone, v.lmin, v.lmax, v.body, null from (values
('Copper and Tin: Elwynn, Westfall and Redridge loop', 'Gathering', 'Elwynn Forest, Westfall, Redridge Mountains', 1, 25,
'A starter mining run for Alliance. Turn on Find Minerals before you set off.

## Route
1. Start at Goldshire and follow the Elwynn hills east past the Jasperlode Mine and Fargodeep Mine. Copper sits in the mine tunnels and along the rocky slopes.
2. Ride south-west into Westfall. Circle the Jangolode Mine and the Gold Coast Quarry, then follow the cliffs along the coast. Expect Copper with some Tin.
3. Head back through Elwynn to Redridge. Loop the lake and the hills around Lakeshire, then the ridges to the north. Tin and Silver start to show up here.

## Tips
- Smelt as you go. Copper Bars and Bronze Bars sell better on the guild market than raw ore.
- Rough Stone and Coarse Stone from these nodes are wanted by engineers and blacksmiths. Check the Request Board before vendoring.
- Ask in guild chat if anyone needs Silver or Tin before listing it.'),
('Peacebloom, Silverleaf and Earthroot: the Elwynn to Loch Modan herb run', 'Gathering', 'Elwynn Forest, Dun Morogh, Loch Modan', 1, 20,
'Herbalism starts with three plants that grow everywhere in the starting zones. Turn on Find Herbs.

## Route
1. Elwynn Forest: sweep the fields between Northshire, Goldshire and Eastvale Logging Camp. Peacebloom and Silverleaf grow on open grass.
2. Dun Morogh: follow the road from Kharanos to the Gates of Ironforge, then the slopes towards Loch Modan. Earthroot grows by the hillsides.
3. Loch Modan: loop the loch shore. Mageroyal and Briarthorn appear once you reach skill 50.

## Tips
- Alchemists in the guild turn these into Minor Healing Potions for new members. Post spares on the Request Board.
- Keep gathering past what you need. Herbs are often among the first things guildmates ask for.'),
('Iron, Mithril and herbs in the Arathi Highlands and Badlands', 'Gathering', 'Arathi Highlands, Badlands', 30, 45,
'A mid-level run for Iron Ore, Mithril Ore and Fadeleaf, Khadgar''s Whisker and Wintersbite.

## Route
1. Fly to Refuge Pointe. Loop the Arathi hills clockwise: Witherbark Village, the Drywhisker Gorge cave, then the north-east hills.
2. Take the road south through the Wetlands to Loch Modan and on to the Badlands. Circle the canyon walls. Mithril and Iron sit in the cliffs, and Badlands has lots of Kingsblood and Wild Steelbloom.

## Tips
- Iron Bars and Mithril Bars are always needed by blacksmiths and engineers. Check the Market prices tab before you sell.
- Elementals in the Badlands drop Elemental Earth, which crafters ask for often.'),
('Alliance questing path, levels 1 to 30', 'Questing', 'Elwynn, Westfall, Loch Modan, Redridge, Darkshore, Duskwood', 1, 30,
'A smooth Alliance route through the low-level zones. Follow it and you will rarely run out of quests.

## Path
- 1 to 10: your race''s starting zone (Elwynn Forest, Dun Morogh or Teldrassil).
- 10 to 15: Westfall or Loch Modan. Westfall has the Defias quests and leads into the Deadmines.
- 15 to 20: Redridge Mountains, then Darkshore for the boat-side chain.
- 20 to 25: Ashenvale and the start of Duskwood.
- 25 to 30: Duskwood, Wetlands, and Redridge''s last quests. Group up for the Deadmines along the way.

## Tips
- Pick up every flight path as you pass. The guild city guide shows trainers and vendors in Stormwind and Ironforge.
- Ask on the Request Board for bags. Crafters in the guild will make them.'),
('Alliance questing path, levels 30 to 60', 'Questing', 'Stranglethorn, Desolace, Tanaris, Un''Goro, Winterspring', 30, 60,
'The usual Alliance path from 30 to the level cap.

## Path
- 30 to 40: Arathi Highlands, Stranglethorn Vale, Desolace and Dustwallow Marsh.
- 40 to 48: Tanaris, Feralas and The Hinterlands.
- 48 to 55: Un''Goro Crater, Felwood, Azshara and the Searing Gorge.
- 55 to 60: Winterspring, Western and Eastern Plaguelands, and Silithus.

## Tips
- Save Stranglethorn page quests for when you have the full chapter. They are worth a lot of experience at once.
- Un''Goro has crystals and Devilsaur Leather that sell well. Check the Market prices tab.'),
('Items that tend to sell well', 'Market', '', null, null,
'These items are almost always in demand. Check the live prices on the Market prices tab before you sell, and report what you see in Trade chat so the whole guild can follow the trend.

## Usually high value
- Arcanite Bar: needed for top-end gear and only one can be made a day.
- Black Lotus: the rarest herb, used for flasks.
- Large Brilliant Shard and Greater Eternal Essence: wanted by enchanters at max level.
- Devilsaur Leather: for leatherworking sets.
- Elemental Fire, Elemental Earth and Essence of Fire: needed by many crafters.
- Runecloth and Mooncloth: cloth for tailoring at max level.
- Thorium Bars and Dense Stone.

## Tips
- Prices are usually highest at the weekend and before raid nights.
- Selling to a guildmate on the Market tab keeps the gold in the guild. Be fair.')
) as v(title, category, zone, lmin, lmax, body)
where not exists (select 1 from public.guides);

select (select count(*) from public.guides) as guides, (select count(*) from public.price_points) as prices;
