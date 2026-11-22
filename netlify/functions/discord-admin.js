// Admin page → Discord tab. ?action=status reports how far setup has got (never the secret values);
// ?action=setup points Discord at the bot, installs the slash commands in each server the bot is in,
// and links the bot to the guild's data. Only signed-in guild admins can use it.
const { SUPABASE_URL, SUPABASE_PUBLISHABLE, json } = require("./_shared");
const { dcfg, dataKeyHash, rpc, discordApi, COMMANDS } = require("./_discord");

async function adminFrom(event) {
  const jwt = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const u = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: "Bearer " + jwt } });
  if (!u.ok) return null;
  const { id } = await u.json();
  const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(id)}`, { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: "Bearer " + jwt } });
  const rows = p.ok ? await p.json() : [];
  return rows[0] && rows[0].is_admin ? { id, jwt } : null;
}

exports.handler = async (event) => {
  const cfg = dcfg();
  const admin = await adminFrom(event).catch(() => null);
  if (!admin) return json(403, { error: "Only guild admins can manage the Discord bot." });
  const action = (event.queryStringParameters || {}).action || "status";
  const interactionsUrl = cfg.site + "/.netlify/functions/discord";
  const out = {
    configured: { appId: !!cfg.appId, publicKey: /^[0-9a-f]{64}$/.test(cfg.publicKey), token: !!cfg.token },
    interactionsUrl,
    inviteUrl: cfg.appId ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(cfg.appId)}&scope=bot%20applications.commands&permissions=536890368` : "",
  };
  if (!out.configured.appId || !out.configured.publicKey || !out.configured.token) {
    out.step = "keys";
    return json(200, out);
  }

  try {
    const app = await discordApi(cfg, "GET", "/applications/@me");
    out.bot = { name: app.name, endpointSet: app.interactions_endpoint_url === interactionsUrl };
    if (String(app.id) !== cfg.appId) out.warning = "DISCORD_APP_ID doesn't match the bot token's application. Check both values in Netlify.";
  } catch (e) {
    out.step = "keys"; out.error = e.status === 401 ? "Discord didn't accept the bot token. Copy it again from the Bot page (Reset Token) into DISCORD_BOT_TOKEN in Netlify." : "Couldn't reach Discord: " + e.message;
    return json(200, out);
  }

  let guilds = [];
  try { guilds = await discordApi(cfg, "GET", "/users/@me/guilds"); } catch {}
  out.servers = guilds.map((g) => ({ id: g.id, name: g.name }));

  if (action === "setup") {
    if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
    out.done = [];
    try {
      await discordApi(cfg, "PATCH", "/applications/@me", { interactions_endpoint_url: interactionsUrl });
      out.bot.endpointSet = true; out.done.push("Discord now sends commands to the website.");
    } catch (e) {
      out.error = "Discord couldn't reach the bot address. Check DISCORD_PUBLIC_KEY in Netlify matches the Public Key on the app's General Information page, then redeploy. (" + e.message + ")";
      return json(200, out);
    }
    for (const g of out.servers) {
      try { const cmds = await discordApi(cfg, "PUT", `/applications/${cfg.appId}/guilds/${g.id}/commands`, COMMANDS); g.commands = cmds.length; out.done.push(`Added ${cmds.length} slash commands to ${g.name}.`); }
      catch (e) { g.error = e.message; }
    }
    try { await rpc("discord_set_bot_key", { p_hash: dataKeyHash(cfg) }, admin.jwt); out.linked = true; out.done.push("The bot can now read guild recipes, members, the board and the market."); }
    catch (e) { out.error = "Couldn't link the bot to the guild data: " + e.message; }
  } else {
    for (const g of out.servers.slice(0, 5)) {
      try { g.commands = (await discordApi(cfg, "GET", `/applications/${cfg.appId}/guilds/${g.id}/commands`)).length; } catch { g.commands = null; }
    }
  }
  out.step = !out.servers.length ? "invite" : out.servers.some((g) => g.commands) && out.bot.endpointSet ? "ready" : "setup";
  return json(200, out);
};
