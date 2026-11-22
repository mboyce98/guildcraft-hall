// Blizzard sends members back here after they approve. Fetches their BattleTag and WoW characters,
// then hands them to the page, which saves them under the member's own sign-in.
const { env, ready, readState } = require("./_shared");

// Blizzard keeps each game version's characters in its own namespace. We try each one and keep what answers.
const GAMES = (region) => [
  { ns: `profile-${region}`, label: "Retail" },
  { ns: `profile-classic-${region}`, label: "Classic progression" },
  { ns: `profile-classic1x-${region}`, label: "Classic Era" },
  { ns: `profile-forever-${region}`, label: "WoW Forever" },
];

const page = (cfg, status, data) => ({
  statusCode: 200,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  // Same site as the page, so sessionStorage carries the result over without putting it in the address bar.
  body: `<!doctype html><meta charset="utf-8"><title>Linking Battle.net…</title><p>Finishing up…</p><script>
try { ${data ? `sessionStorage.setItem("gc.bnet", ${JSON.stringify(JSON.stringify(data)).replace(/</g, "\\u003c")});` : ""} } catch (e) {}
location.replace(${JSON.stringify(`${cfg.site}/?bnet=${status}#mine`)});
</script>`,
});

exports.handler = async (event) => {
  const cfg = env();
  const q = event.queryStringParameters || {};
  if (q.error) return page(cfg, "cancelled");
  if (!ready(cfg)) return page(cfg, "off");

  let state;
  try { state = readState(q.state, cfg.clientSecret); } catch { state = null; }
  if (!state || !q.code) return page(cfg, "expired");

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
    if (!tokenRes.ok) { console.error("token exchange failed", tokenRes.status); return page(cfg, "failed"); }
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
            surname: c.surname || "", slug: c.slug || "",
          });
        }
      }
    }
    characters.sort((a, b) => (b.level || 0) - (a.level || 0));

    return page(cfg, characters.length ? "linked" : "linked-nochars", {
      u: state.u, battletag: me.battletag || "", bnetId: me.id || null, region: cfg.region, characters: characters.slice(0, 200),
    });
  } catch (e) {
    console.error(e);
    return page(cfg, "failed");
  }
};
