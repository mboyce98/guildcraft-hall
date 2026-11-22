// Temporary: shows the shape of the WoW Forever character API (public game data only).
const { env, json } = require("./_shared");
exports.handler = async (event) => {
  const cfg = env(); const q = event.queryStringParameters || {};
  const slug = String(q.c || "mason-nightwin").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const t = await fetch("https://oauth.battle.net/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const { access_token } = await t.json(); const h = { Authorization: "Bearer " + access_token };
  const r = cfg.region, out = {};
  const base = `https://${r}.api.blizzard.com/profile/wow/character/${slug}`;
  const ns = `?namespace=profile-forever-${r}&locale=en_US`;
  const sub = q.sub ? [q.sub] : ["", "/equipment", "/character-media", "/statistics", "/specializations", "/professions", "/hunter-pets", "/pvp-summary", "/appearance", "/titles", "/reputations"];
  for (const p of sub) { try { const x = await fetch(base + p + ns, { headers: h }); const txt = await x.text(); out[p || "/"] = x.status + " " + (q.sub ? txt : txt.slice(0, 1500)); } catch (e) { out[p] = String(e); } }
  return json(200, out);
};
