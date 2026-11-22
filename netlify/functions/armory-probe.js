// Temporary: checks which Blizzard API paths answer for a WoW Forever character (statuses only).
const { env, json } = require("./_shared");
exports.handler = async (event) => {
  const cfg = env(); const q = event.queryStringParameters || {};
  const name = String(q.name || "mason").toLowerCase(), sur = String(q.sur || "nightwin").toLowerCase();
  const t = await fetch("https://oauth.battle.net/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const { access_token } = await t.json(); const h = { Authorization: "Bearer " + access_token };
  const r = cfg.region, out = {};
  const tries = [
    `profile/wow/character/${sur}/${name}?namespace=profile-forever-${r}`,
    `profile/wow/character/${name}-${sur}?namespace=profile-forever-${r}`,
    `profile/wow/character/forever/${name}-${sur}?namespace=profile-forever-${r}`,
    `profile/wow/character/${name}/${sur}?namespace=profile-forever-${r}`,
    `data/wow/realm/index?namespace=dynamic-forever-${r}`,
    `data/wow/realm/index?namespace=dynamic-classic1x-${r}`,
  ];
  for (const p of tries) { try { const x = await fetch(`https://${r}.api.blizzard.com/${p}&locale=en_US`, { headers: h }); out[p] = x.status + " " + (await x.text()).slice(0, 300); } catch (e) { out[p] = String(e); } }
  return json(200, out);
};
