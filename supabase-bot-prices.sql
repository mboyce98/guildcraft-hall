-- =========================================================
-- BARK AND STONE - /price in Discord: the bot reads reported prices and market listings for one item.
-- Run after supabase-guides.sql and supabase-events.sql. Safe to re-run.
-- =========================================================
create or replace function public.bot_prices(p_key text, p_item text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare q text := lower(trim(coalesce(p_item, '')));
begin
  perform private.bot_check(p_key);
  if q = '' then
    -- Item names with recent reports or listings, for suggestions while typing.
    return coalesce((select jsonb_agg(x.item order by x.n desc) from (
      select min(item) as item, count(*) as n from (
        select item from price_points where created_at > now() - interval '60 days'
        union all select item from listings) s group by lower(trim(item)) order by count(*) desc limit 200) x), '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'reports', coalesce((select jsonb_agg(jsonb_build_object('price', price, 'source', source, 'at', created_at) order by created_at desc)
      from price_points where lower(trim(item)) = q and created_at > now() - interval '60 days'), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'qty', qty, 'price', price, 'char', char, 'note', note) order by created_at desc)
      from listings where lower(trim(item)) = q), '[]'::jsonb));
end $$;
grant execute on function public.bot_prices(text, text) to anon, authenticated;

select 'bot prices ready' as status;
