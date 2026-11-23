// Armory card for a WoW Forever character: gear, stats, talents, professions, pets, reputation and portrait.
// Public game data from Blizzard's API (app token, no member sign-in needed). ?c=<name>-<surname>, e.g. mason-nightwin.
const { env, ready, json } = require("./_shared");

let token = null, tokenUntil = 0;
async function appToken(cfg) {
  if (token && Date.now() < tokenUntil) return token;
  const r = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("token " + r.status);
  const d = await r.json();
  token = d.access_token; tokenUntil = Date.now() + Math.max(60, (d.expires_in || 3600) - 300) * 1000;
  return token;
}

const n = (x) => (x && typeof x === "object" ? x.name : x) || "";
const pct = (x) => (x && typeof x.value === "number" ? Math.round(x.value * 100) / 100 : null);

exports.handler = async (event) => {
  const cfg = env();
  if (!ready(cfg)) return json(503, { error: "Battle.net isn't set up on this site yet." });
  const slug = String((event.queryStringParameters || {}).c || "").trim().toLowerCase();
  if (!/^[\p{L}\p{N}]{2,24}(-[\p{L}\p{N}' ]{1,40})?$/u.test(slug)) return json(400, { error: "Give a character as name-surname, e.g. mason-nightwin." });

  try {
    const tk = await appToken(cfg);
    const base = `https://${cfg.region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(slug)}`;
    const qs = `?namespace=profile-forever-${cfg.region}&locale=en_US`;
    const get = async (p) => { const r = await fetch(base + p + qs, { headers: { Authorization: "Bearer " + tk } }); if (r.status === 404) return null; if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };

    const sum = await get("");
    if (!sum) return json(404, { error: "Blizzard doesn't have that character. Check the name and surname (it shows on the Armory once they've logged in recently)." });
    const isHunter = n(sum.character_class) === "Hunter";
    const opt = (p) => get(p).catch(() => null);
    const [eq, media, stats, specs, profs, pets, pvp, reps, app, mounts, achStats] = await Promise.all([
      opt("/equipment"), opt("/character-media"), opt("/statistics"), opt("/specializations"), opt("/professions"),
      isHunter ? opt("/hunter-pets") : null, opt("/pvp-summary"), opt("/reputations"), opt("/appearance"),
      opt("/collections/mounts"), opt("/achievements/statistics"),
    ]);
    // Boss kills (for guild achievements), from the "Dungeons & Raids / Boss Kills" statistics,
    // e.g. "Edwin VanCleef kills (The Deadmines)" -> { b: "Edwin VanCleef", i: "The Deadmines", n: 2 }.
    const bosses = [];
    const walk = (cats, path) => { for (const c of cats || []) { const p = path + "/" + (c.name || ""); if (/boss kills/i.test(p)) for (const s of c.statistics || []) { const m = String(s.name || "").match(/^(.*?)\s+(?:kills|victories)?\s*(?:\((.*)\))?$/i); if (m && s.quantity > 0) bosses.push({ b: m[1].replace(/\s+(kills|victories)$/i, ""), i: m[2] || "", n: s.quantity }); } walk(c.sub_categories, p); } };
    walk(achStats && achStats.categories, "");

    const asset = (k) => ((media && media.assets) || []).find((a) => a.key === k)?.value || "";
    const surname = (app && app.character && app.character.surname) || (eq && eq.character && eq.character.surname) || "";
    const st = stats || {};
    const out = {
      slug, id: sum.id, name: sum.name, surname, level: sum.level,
      race: n(sum.race), cls: n(sum.character_class), gender: n(sum.gender), faction: n(sum.faction),
      guild: n(sum.guild), title: n(sum.active_title).replace("%s", sum.name),
      ilvl: sum.equipped_item_level || sum.average_item_level || null, lastLogin: sum.last_login_timestamp || null,
      avatar: asset("avatar"), render: asset("main-raw"),
      armory: `https://worldofwarcraft.blizzard.com/en-us/forever/${cfg.region}/armory/character/${encodeURIComponent(slug)}`,
      gear: ((eq && eq.equipped_items) || []).map((i) => ({
        slot: i.slot && i.slot.type, slotName: n(i.slot), id: i.item && i.item.id, name: i.name,
        q: String((i.quality && i.quality.type) || "COMMON").toLowerCase(), ilvl: i.level && i.level.value,
        enchant: ((i.enchantments || [])[0] || {}).display_string || "",
      })),
      stats: stats ? {
        health: st.health, power: st.power, powerType: n(st.power_type),
        strength: st.strength && st.strength.effective, agility: st.agility && st.agility.effective,
        stamina: st.stamina && st.stamina.effective, intellect: st.intellect && st.intellect.effective, spirit: st.spirit && st.spirit.effective,
        armor: st.armor && st.armor.effective, attackPower: st.attack_power, spellPower: st.spell_power,
        crit: pct(st.melee_crit), spellCrit: pct(st.spell_crit), rangedCrit: pct(st.ranged_crit), dodge: pct(st.dodge), parry: pct(st.parry), block: pct(st.block),
        mainDps: st.main_hand_dps ? Math.round(st.main_hand_dps * 10) / 10 : null, manaRegen: st.mana_regen,
      } : null,
      specs: ((specs && specs.specialization_groups) || []).filter((g) => g.is_active !== false).flatMap((g) => g.specializations || []).map((s) => ({
        name: n(s.specialization) || s.specialization_name, points: s.spent_points || 0,
        talents: (s.talents || []).map((t) => ({ name: n(t.talent), spell: t.spell_tooltip && t.spell_tooltip.spell && t.spell_tooltip.spell.id, rank: t.talent_rank, text: (t.spell_tooltip && t.spell_tooltip.description) || "" })),
      })),
      professions: [...((profs && profs.primaries) || []).map((p) => [p, 1]), ...((profs && profs.secondaries) || []).map((p) => [p, 0])].map(([p, primary]) => {
        const t = (p.tiers || [])[0] || {};
        return { name: n(p.profession), primary: !!primary, skill: t.skill_points || p.skill_points || 0, max: t.max_skill_points || p.max_skill_points || 0, recipes: (t.known_recipes || []).length };
      }),
      pets: ((pets && pets.hunter_pets) || []).map((p) => ({ name: p.name, level: p.level, creature: n(p.creature), active: !!p.is_active })),
      pvp: pvp ? { kills: pvp.honorable_kills || 0, rank: pvp.pvp_rank || 0 } : null,
      reputations: ((reps && reps.reputations) || []).map((r) => ({ name: n(r.faction), standing: n(r.standing), value: r.standing && r.standing.value, max: r.standing && r.standing.max, tier: r.standing && r.standing.tier }))
        .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || a.name.localeCompare(b.name)),
      bosses,
      mounts: mounts ? ((mounts.mounts || []).map((m) => n(m.mount))) : null,
      fetched: Date.now(),
    };
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json", "cache-control": "public, max-age=600",
        "netlify-cdn-cache-control": "public, s-maxage=1800, stale-while-revalidate=3600", "netlify-vary": "query=c",
      },
      body: JSON.stringify(out),
    };
  } catch (e) {
    console.error(e);
    return json(502, { error: "Blizzard's Armory didn't answer just now. Try again in a minute." });
  }
};
