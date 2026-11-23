-- =========================================================
-- BARK AND STONE - Achievements. The guild master (rank Thane) is the ruling authority:
-- only they can create, edit or retire achievements, approve or deny claims, award honours, and revoke anything.
-- Members earn site achievements automatically and claim guild deeds (dungeons, raids, adventures) for approval.
-- Run in Supabase -> SQL Editor. Safe to re-run (it won't overwrite achievements the guild master has edited).
-- =========================================================
create or replace function public.is_guildmaster() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select guild_rank = 'Thane' from profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_guildmaster() to authenticated;

create table if not exists public.achievements (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 2 and 50),
  description text not null default '' check (char_length(description) <= 200),
  icon        text not null default 'inv_misc_questionmark' check (icon ~ '^[a-z0-9_]{1,80}$'),
  category    text not null default 'Guild' check (char_length(category) between 1 and 30),
  points      int  not null default 10 check (points between 0 and 100),
  kind        text not null default 'claim' check (kind in ('auto', 'self', 'claim', 'award')),
  rule        jsonb,
  sort        int  not null default 100,
  retired     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.achievements enable row level security;
grant select, insert, update, delete on public.achievements to authenticated;
drop policy if exists "guild sees achievements" on public.achievements;
create policy "guild sees achievements" on public.achievements for select to authenticated using (true);
drop policy if exists "guild master edits achievements" on public.achievements;
create policy "guild master edits achievements" on public.achievements for all to authenticated
  using (public.is_guildmaster()) with check (public.is_guildmaster());

create table if not exists public.achievement_awards (
  id             bigint generated always as identity primary key,
  achievement_id text not null references public.achievements(id) on delete cascade on update cascade,
  user_id        uuid not null references auth.users on delete cascade,
  status         text not null check (status in ('pending', 'granted', 'denied', 'revoked')),
  note           text not null default '' check (char_length(note) <= 200),
  gm_note        text not null default '' check (char_length(gm_note) <= 200),
  decided_by     uuid references auth.users on delete set null,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  unique (achievement_id, user_id)
);
create index if not exists achievement_awards_user_idx on public.achievement_awards (user_id);
alter table public.achievement_awards enable row level security;
grant select, insert, update, delete on public.achievement_awards to authenticated;
grant usage on sequence public.achievement_awards_id_seq to authenticated;

drop policy if exists "guild sees awards" on public.achievement_awards;
create policy "guild sees awards" on public.achievement_awards for select to authenticated using (true);
-- Members: claim a guild deed (pending), or record a site achievement they've earned (granted). The guild master: anything.
drop policy if exists "claim or earn" on public.achievement_awards;
create policy "claim or earn" on public.achievement_awards for insert to authenticated with check (
  public.is_guildmaster() or (
    user_id = auth.uid() and exists (select 1 from public.achievements a where a.id = achievement_id and not a.retired
      and ((a.kind = 'claim' and status = 'pending') or (a.kind in ('auto', 'self') and status = 'granted')))));
drop policy if exists "guild master decides" on public.achievement_awards;
create policy "guild master decides" on public.achievement_awards for update to authenticated
  using (public.is_guildmaster()) with check (public.is_guildmaster());
-- Members can withdraw their own pending or denied claim (to claim again later). The guild master can remove anything.
drop policy if exists "withdraw own claim" on public.achievement_awards;
create policy "withdraw own claim" on public.achievement_awards for delete to authenticated
  using (public.is_guildmaster() or (user_id = auth.uid() and status in ('pending', 'denied')));

-- Stamp who decided and when.
create or replace function public.award_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status in ('granted', 'denied', 'revoked') and public.is_guildmaster() then
    new.decided_by := auth.uid(); new.decided_at := now();
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.decided_by := auth.uid(); new.decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists award_stamp on public.achievement_awards;
create trigger award_stamp before insert or update on public.achievement_awards for each row execute function public.award_stamp();

-- Starter achievements (skipped if they already exist, so the guild master's edits are kept).
insert into public.achievements (id, name, description, icon, category, points, kind, rule, sort) values
  ('welcome', 'Welcome to the Hall', 'Make your Bark and Stone account.', 'inv_misc_note_01', 'Getting started', 5, 'auto', '{"t":"account"}'::jsonb, 1),
  ('ledger', 'Name in the Ledger', 'Fill in your main character, class and level on your profile.', 'inv_misc_book_09', 'Getting started', 5, 'auto', '{"t":"profile"}'::jsonb, 2),
  ('portrait', 'A Face in the Crowd', 'Add a profile picture.', 'inv_misc_head_human_01', 'Getting started', 5, 'auto', '{"t":"avatar"}'::jsonb, 3),
  ('level-10', 'Level 10', 'Reach level 10 on your main.', 'achievement_level_10', 'Leveling', 5, 'auto', '{"t":"level","n":10}'::jsonb, 10),
  ('level-20', 'Level 20', 'Reach level 20 on your main.', 'achievement_level_20', 'Leveling', 10, 'auto', '{"t":"level","n":20}'::jsonb, 11),
  ('level-30', 'Level 30', 'Reach level 30 on your main.', 'achievement_level_30', 'Leveling', 10, 'auto', '{"t":"level","n":30}'::jsonb, 12),
  ('level-40', 'Level 40', 'Reach level 40 on your main. Time to ride!', 'achievement_level_40', 'Leveling', 15, 'auto', '{"t":"level","n":40}'::jsonb, 13),
  ('level-50', 'Level 50', 'Reach level 50 on your main.', 'achievement_level_50', 'Leveling', 15, 'auto', '{"t":"level","n":50}'::jsonb, 14),
  ('level-60', 'Level 60', 'Reach the level cap on your main.', 'achievement_level_60', 'Leveling', 25, 'auto', '{"t":"level","n":60}'::jsonb, 15),
  ('apprentice', 'Apprentice Crafter', 'List a profession on My crafter.', 'trade_blacksmithing', 'Crafting', 5, 'auto', '{"t":"profession"}'::jsonb, 20),
  ('recipes-25', 'Recipe Collector', 'List 25 known recipes.', 'inv_scroll_03', 'Crafting', 10, 'auto', '{"t":"recipes","n":25}'::jsonb, 21),
  ('recipes-100', 'Recipe Hoarder', 'List 100 known recipes.', 'inv_scroll_05', 'Crafting', 15, 'auto', '{"t":"recipes","n":100}'::jsonb, 22),
  ('recipes-250', 'Living Recipe Book', 'List 250 known recipes.', 'inv_misc_book_11', 'Crafting', 25, 'auto', '{"t":"recipes","n":250}'::jsonb, 23),
  ('skill-150', 'Journeyman', 'Reach 150 skill in a crafting profession.', 'inv_misc_gear_01', 'Crafting', 10, 'auto', '{"t":"skill","n":150}'::jsonb, 24),
  ('skill-300', 'Artisan', 'Reach 300 skill in a crafting profession.', 'inv_misc_gear_08', 'Crafting', 25, 'auto', '{"t":"skill","n":300}'::jsonb, 25),
  ('commission-1', 'First Commission', 'Finish a crafting request for a guildmate.', 'inv_hammer_20', 'Crafting', 10, 'auto', '{"t":"craft_done","n":1}'::jsonb, 26),
  ('commission-10', 'Crafter of the Guild', 'Finish 10 crafting requests for guildmates.', 'inv_hammer_25', 'Crafting', 25, 'auto', '{"t":"craft_done","n":10}'::jsonb, 27),
  ('open-for-business', 'Open for Business', 'Post a listing on the guild market.', 'inv_misc_coin_01', 'Trade', 5, 'auto', '{"t":"listing"}'::jsonb, 30),
  ('ask-and-receive', 'Ask and Receive', 'Post a request on the Request Board.', 'inv_letter_15', 'Trade', 5, 'auto', '{"t":"board_post"}'::jsonb, 31),
  ('helping-hand', 'Helping Hand', 'Finish a job from the Request Board.', 'spell_holy_heal', 'Trade', 10, 'auto', '{"t":"board_done","n":1}'::jsonb, 32),
  ('guild-provider', 'Guild Provider', 'Finish 5 jobs from the Request Board.', 'spell_holy_greaterheal', 'Trade', 20, 'auto', '{"t":"board_done","n":5}'::jsonb, 33),
  ('market-watcher', 'Market Watcher', 'Report 10 market prices on the Guides page.', 'inv_misc_coin_02', 'Trade', 10, 'auto', '{"t":"prices","n":10}'::jsonb, 34),
  ('answer-the-call', 'Answer the Call', 'Sign up for a guild event.', 'ability_warrior_rallyingcry', 'Guild life', 5, 'auto', '{"t":"event","n":1}'::jsonb, 40),
  ('regular', 'Regular', 'Sign up for 5 guild events.', 'ability_warrior_battleshout', 'Guild life', 15, 'auto', '{"t":"event","n":5}'::jsonb, 41),
  ('rally-leader', 'Rally Leader', 'Plan a guild event.', 'inv_misc_horn_01', 'Guild life', 10, 'auto', '{"t":"event_host"}'::jsonb, 42),
  ('lorekeeper', 'Lorekeeper', 'Write a guide for the guild.', 'inv_misc_book_07', 'Guild life', 15, 'auto', '{"t":"guide"}'::jsonb, 43),
  ('rfc', 'Ragefire Chasm', 'Clear Ragefire Chasm with guildmates.', 'spell_fire_fire', 'Dungeons', 10, 'self', null, 50),
  ('wailing-caverns', 'Wailing Caverns', 'Clear Wailing Caverns with guildmates.', 'spell_nature_sleep', 'Dungeons', 10, 'self', null, 51),
  ('deadmines', 'The Deadmines', 'Defeat Edwin VanCleef with guildmates.', 'inv_misc_bandana_03', 'Dungeons', 10, 'self', null, 52),
  ('shadowfang', 'Shadowfang Keep', 'Defeat Archmage Arugal with guildmates.', 'spell_shadow_charm', 'Dungeons', 10, 'self', null, 53),
  ('blackfathom', 'Blackfathom Deeps', 'Defeat Aku''mai with guildmates.', 'spell_frost_summonwaterelemental', 'Dungeons', 10, 'self', null, 54),
  ('stockade', 'The Stockade', 'Clear the Stockade with guildmates.', 'inv_misc_key_03', 'Dungeons', 10, 'self', null, 55),
  ('gnomeregan', 'Gnomeregan', 'Defeat Mekgineer Thermaplugg with guildmates.', 'inv_misc_gear_02', 'Dungeons', 15, 'self', null, 56),
  ('razorfen-kraul', 'Razorfen Kraul', 'Defeat Charlga Razorflank with guildmates.', 'inv_misc_root_02', 'Dungeons', 15, 'self', null, 57),
  ('scarlet', 'Scarlet Crusader', 'Clear all four wings of the Scarlet Monastery with guildmates.', 'inv_shield_14', 'Dungeons', 20, 'self', null, 58),
  ('razorfen-downs', 'Razorfen Downs', 'Defeat Amnennar the Coldbringer with guildmates.', 'spell_shadow_raisedead', 'Dungeons', 15, 'self', null, 59),
  ('uldaman', 'Uldaman', 'Defeat Archaedas with guildmates.', 'inv_misc_stonetablet_05', 'Dungeons', 15, 'self', null, 60),
  ('zulfarrak', 'Zul''Farrak', 'Defeat Chief Ukorz Sandscalp with guildmates.', 'inv_misc_head_troll_01', 'Dungeons', 15, 'self', null, 61),
  ('maraudon', 'Maraudon', 'Defeat Princess Theradras with guildmates.', 'inv_misc_root_01', 'Dungeons', 15, 'self', null, 62),
  ('sunken-temple', 'Sunken Temple', 'Defeat the Shade of Eranikus with guildmates.', 'inv_misc_head_dragon_green', 'Dungeons', 20, 'self', null, 63),
  ('blackrock-depths', 'Blackrock Depths', 'Defeat Emperor Dagran Thaurissan with guildmates.', 'spell_fire_lavaspawn', 'Dungeons', 20, 'self', null, 64),
  ('stratholme', 'Stratholme', 'Defeat Baron Rivendare with guildmates.', 'spell_shadow_deathcoil', 'Dungeons', 20, 'self', null, 65),
  ('scholomance', 'Scholomance', 'Defeat Darkmaster Gandling with guildmates.', 'spell_shadow_shadowbolt', 'Dungeons', 20, 'self', null, 66),
  ('molten-core', 'Into the Fire', 'Defeat Ragnaros in Molten Core with the guild.', 'spell_fire_incinerate', 'Raids', 50, 'self', null, 70),
  ('onyxia', 'Onyxia''s End', 'Defeat Onyxia with the guild.', 'inv_misc_head_dragon_01', 'Raids', 40, 'self', null, 71),
  ('zulgurub', 'The Blood God', 'Defeat Hakkar in Zul''Gurub with the guild.', 'inv_misc_head_troll_01', 'Raids', 40, 'self', null, 72),
  ('blackwing-lair', 'Blackwing Descent', 'Defeat Nefarian in Blackwing Lair with the guild.', 'inv_misc_head_dragon_black', 'Raids', 50, 'self', null, 73),
  ('ahnqiraj', 'Scarab Lord''s Shadow', 'Defeat C''Thun in the Temple of Ahn''Qiraj with the guild.', 'spell_shadow_charm', 'Raids', 60, 'claim', null, 74),
  ('naxxramas', 'The Fall of Naxxramas', 'Defeat Kel''Thuzad with the guild.', 'spell_shadow_soulgem', 'Raids', 75, 'claim', null, 75),
  ('first-mount', 'Saddle Up', 'Learn to ride and get your first mount.', 'ability_mount_ridinghorse', 'Adventure', 15, 'self', null, 80),
  ('epic-mount', 'Swift as the Wind', 'Get a swift (epic) mount.', 'ability_mount_whitetiger', 'Adventure', 25, 'self', null, 81),
  ('exalted', 'Exalted', 'Reach Exalted with any faction.', 'inv_misc_tabardpvp_01', 'Adventure', 20, 'self', null, 82),
  ('angler', 'Master Angler', 'Reach 300 Fishing.', 'trade_fishing', 'Adventure', 15, 'self', null, 83),
  ('leveling-buddy', 'Leveling Buddy', 'Level 10 times while grouped with a guildmate.', 'inv_misc_groupneedmore', 'Adventure', 15, 'self', null, 84),
  ('recruiter', 'Recruiter', 'Bring a friend into Bark and Stone.', 'inv_letter_02', 'Adventure', 15, 'claim', null, 85),
  ('founder', 'Founding Member', 'One of the first members of Bark and Stone.', 'inv_misc_tabardsummer01', 'Guild master''s honours', 25, 'award', null, 90),
  ('guild-hero', 'Hero of the Guild', 'Went above and beyond for Bark and Stone.', 'spell_holy_heroism', 'Guild master''s honours', 50, 'award', null, 91),
  ('commendation', 'Officer''s Commendation', 'Recognised by the guild''s leaders for great conduct.', 'inv_misc_ribbon_01', 'Guild master''s honours', 20, 'award', null, 92),
  ('shenanigans', 'Shenanigans!', 'Part of a guild moment we''ll never let you forget.', 'inv_misc_toy_10', 'Guild master''s honours', 10, 'award', null, 93)
on conflict (id) do nothing;

select (select count(*) from public.achievements) as achievements, (select string_agg(username, ', ') from public.profiles where guild_rank = 'Thane') as guild_master;

-- ---------- Upgrade: "self" achievements (members mark them done, granted at once) ----------
-- Safe to run on an existing install. Keeps only a few big deeds for the guild master to approve.
alter table public.achievements drop constraint if exists achievements_kind_check;
alter table public.achievements add constraint achievements_kind_check check (kind in ('auto', 'self', 'claim', 'award'));
update public.achievements set kind = 'self' where kind = 'claim' and id not in ('recruiter', 'ahnqiraj', 'naxxramas');
-- Claims already waiting on deeds that no longer need approval are granted.
update public.achievement_awards w set status = 'granted' from public.achievements a
  where a.id = w.achievement_id and a.kind = 'self' and w.status = 'pending';
