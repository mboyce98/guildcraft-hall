// Admin page → Discord tab. ?action=status reports how far setup has got (never the secret values);
// ?action=setup points Discord at the bot, installs the slash commands in each server the bot is in,
// and links the bot to the guild's data. Only signed-in guild admins can use it.
const { SUPABASE_URL, SUPABASE_PUBLISHABLE, json } = require("./_shared");
const { dcfg, dataKey, dataKeyHash, rpc, discordApi, COMMANDS } = require("./_discord");

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

  // Channels the bot can post in, so a website admin can pick the feed and events channels without being a Discord admin.
  if (action === "channels" || action === "channels-save") {
    const key = dataKey(cfg);
    if (action === "channels-save") {
      if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
      let b = {}; try { b = JSON.parse(event.body || "{}"); } catch {}
      const id = (v) => (v == null ? null : /^\d{5,25}$/.test(String(v)) ? String(v) : "");
      try { await rpc("bot_set_channels", { p_key: key, p_feed: id(b.feed), p_events: id(b.events), p_tz: b.tz || null }); }
      catch (e) { return json(200, { error: /Not allowed/.test(e.message) ? "Press “Set up slash commands” first so the bot is linked to the website." : e.message }); }
      // Say hello in the new feed channel; this also checks the bot is allowed to post there.
      if (b.feed && b.announce) {
        try {
          await discordApi(cfg, "POST", `/channels/${b.feed}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "This is now the guild feed", url: cfg.site + "/", color: 0xe3b55b,
            description: "New **market listings**, **Request Board jobs**, **guild news**, **guides**, **events** and **new members** from the Bark and Stone website will be posted here." }] });
        } catch (e) { out.warning = e.status === 403 ? "Saved, but the bot isn't allowed to post in that channel. Ask a Discord admin to let the Bark and Stone bot send messages there, or pick another channel." : "Saved, but the test post didn't go through: " + e.message; }
      }
    }
    try { out.config = await rpc("bot_config", { p_key: key }); } catch { out.config = null; }
    out.channels = [];
    for (const g of out.servers.slice(0, 5)) {
      try {
        const list = await discordApi(cfg, "GET", `/guilds/${g.id}/channels`);
        const cats = Object.fromEntries(list.filter((c) => c.type === 4).map((c) => [c.id, c.name]));
        list.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => (a.position - b.position))
          .forEach((c) => out.channels.push({ id: c.id, name: c.name, group: cats[c.parent_id] || "", server: g.name }));
      } catch {}
    }
    out.step = "ready";
    return json(200, out);
  }

  // Site invite: the bot posts a "come and see the guild website" message in a channel. Nobody is tagged.
  if (action === "invite-post") {
    if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
    let b = {}; try { b = JSON.parse(event.body || "{}"); } catch {}
    let conf = null; try { conf = await rpc("bot_config", { p_key: dataKey(cfg) }); } catch {}
    const channel = /^\d{5,25}$/.test(String(b.channel || "")) ? String(b.channel) : (conf && conf.feed_channel) || "";
    if (!channel) return json(200, { error: "Pick a channel for the bot to post in." });
    const note = String(b.note || "").trim().slice(0, 300);
    try {
      await discordApi(cfg, "POST", `/channels/${channel}/messages`, {
        allowed_mentions: { parse: [] }, // never pings anyone
        embeds: [{
          title: "🛡️ Hold there, traveller! Have you seen the guild hall?", url: cfg.site + "/", color: 0xe3b55b,
          description: (note ? note + "\n\n" : "") +
            "The guard at the gate says the **Bark and Stone** website has a place for everyone in the guild. If you haven't had a look yet, come on in:\n\n" +
            "⚒️ Find who can craft what, and post jobs on the **Request Board**\n" +
            "💰 Buy and sell on the guild **market**\n" +
            "📅 Sign up for **dungeons, raids and events**\n" +
            "🏆 Earn **achievements** that sync from your Armory as you play\n" +
            "🗺️ The world map, Loot Vault, guides and guild news\n\n" +
            "Signing up takes a minute. Add your main character and you're on the guild roster.",
          footer: { text: "Bark and Stone · guild website" },
        }],
        components: [{ type: 1, components: [{ type: 2, style: 5, label: "Visit the guild hall", url: cfg.site + "/" }] }],
      });
    } catch (e) {
      return json(200, { error: e.status === 403 ? "The bot isn't allowed to post in that channel. Pick another, or ask a Discord admin to let the bot send messages there." : "Discord didn't take the message: " + e.message });
    }
    return json(200, { posted: true });
  }

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
