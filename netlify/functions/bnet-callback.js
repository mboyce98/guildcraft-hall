// Blizzard sends members back here after they approve. Saves their BattleTag and WoW characters.
const { SUPABASE_URL, env, readState } = require("./_shared");

// Blizzard keeps each game version's characters in its own namespace. We try each one and keep what answers.
const GAMES = (region) => [
  { ns: `profile-${region}`, label: "Retail" },
  { ns: `profile-classic-${region}`, label: "Classic progression" },
  { ns: `profile-classic1x-${region}`, label: "Classic Era" },
  { ns: `profile-forever-${region}`, label: "WoW Forever" },
];

exports.handler = async (event) => {
  const cfg = env();
  const back = (status) => ({ statusCode: 302, headers: { Location: `${cfg.site}/?bnet=${status}#mine`, "cache-control": "no-store" }, body: "" });
  const q = event.queryStringParameters || {};
  if (q.error) return back("cancelled");
  if (!cfg.clientId || !cfg.clientSecret || !cfg.secretKey) return back("off");

  let state;
  try { state = readState(q.state, cfg.secretKey); } catch { state = null; }
  if (!state || !q.code) return back("expired");

  try {
    // 1. Swap the one-time code for an access token.
    const tokenRes = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code: q.code, redirect_uri: cfg.site + "/.netlify/functions/bnet-callback" }),
    });
    if (!tokenRes.ok) return back("failed");
    const { access_token } = await tokenRes.json();
    const auth = { Authorization: "Bearer " + access_token };

    // 2. Who is this? (BattleTag)
    const me = await (await fetch("https://oauth.battle.net/userinfo", { headers: auth })).json();

    // 3. Their WoW characters, in whichever game versions Blizzard's API covers.
    const characters = [];
    for (const g of GAMES(cfg.region)) {
      const r = await fetch(`https://${cfg.region}.api.blizzard.com/profile/user/wow?namespace=${g.ns}&locale=en_US`, { headers: auth });
      if (!r.ok) continue;
      const data = await r.json();
      for (const acct of data.wow_accounts || []) {
        for (const c of acct.characters || []) {
          characters.push({
            name: c.name, realm: c.realm && c.realm.name, level: c.level,
            cls: c.playable_class && c.playable_class.name, faction: c.faction && c.faction.name, game: g.label,
          });
        }
      }
    }
    characters.sort((a, b) => (b.level || 0) - (a.level || 0));

    // 4. Save it against the member's GuildCraft account.
    const save = await fetch(`${SUPABASE_URL}/rest/v1/bnet_links?on_conflict=user_id`, {
      method: "POST",
      headers: { apikey: cfg.secretKey, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: state.u, battletag: me.battletag || "", bnet_id: me.id || null, region: cfg.region,
        characters: characters.slice(0, 200), linked_at: new Date().toISOString(),
      }),
    });
    if (!save.ok) { console.error("save failed", save.status, await save.text()); return back("failed"); }
    return back(characters.length ? "linked" : "linked-nochars");
  } catch (e) {
    console.error(e);
    return back("failed");
  }
};
