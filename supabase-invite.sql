-- =========================================================
-- BARK AND STONE - "Invite newcomers": lets the Discord bot tell who in the Discord server already uses the website,
-- so it can nudge everyone else to come and have a look. Run after supabase-events.sql. Safe to re-run.
-- Returns only Discord ids of linked accounts and lower-cased names (username, main character, Discord name);
-- no emails or anything private.
-- =========================================================
create or replace function public.bot_site_people(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, private, auth, extensions as $$
begin
  perform private.bot_check(p_key);
  return jsonb_build_object(
    'ids', coalesce((select jsonb_agg(distinct provider_id) from auth.identities where provider = 'discord'), '[]'::jsonb),
    'names', coalesce((select jsonb_agg(distinct n) from (
        select lower(username) as n from public.profiles
        union select lower(main_char) from public.profiles where main_char <> ''
        union select lower(regexp_replace(discord, '#\d+$', '')) from public.profiles where discord <> ''
      ) x where n <> ''), '[]'::jsonb));
end $$;
grant execute on function public.bot_site_people(text) to anon, authenticated;

select 'invite newcomers ready' as status;
