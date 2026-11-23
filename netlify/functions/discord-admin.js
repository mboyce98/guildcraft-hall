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

  // Invite newcomers: find people in the Discord server who don't use the website yet, and (on POST) have the bot greet them.
  if (action === "newcomers" || action === "newcomers-post") {
    const key = dataKey(cfg);
    let site;
    try { site = await rpc("bot_site_people", { p_key: key }); }
    catch (e) { return json(200, { error: /Not allowed/.test(e.message) ? "Press “Set up slash commands” first so the bot is linked to the website."
      : /bot_site_people|function/i.test(e.message) ? "Run supabase-invite.sql in the Supabase SQL editor first." : e.message }); }
    const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const linked = new Set(site.ids || []), names = new Set((site.names || []).map(norm).filter(Boolean));
    const people = [];
    for (const g of out.servers.slice(0, 5)) {
      let after = "0";
      for (let page = 0; page < 5; page++) {
        let list;
        try { list = await discordApi(cfg, "GET", `/guilds/${g.id}/members?limit=1000&after=${after}`); }
        catch (e) {
          if (e.status === 403 || (e.data && e.data.code === 50001)) return json(200, { ...out, error: "Discord won't share the member list yet. In the Discord Developer Portal, open the app → Bot, turn on “Server Members Intent”, press Save Changes, then try again." });
          throw e;
        }
        for (const m of list) {
          const u = m.user || {};
          if (u.bot || linked.has(u.id) || people.some((p) => p.id === u.id)) continue;
          // Someone whose Discord name, nickname or username matches a site username, main character or saved Discord name already uses the site.
          const parts = [m.nick, u.global_name, u.username].filter(Boolean);
          if (parts.some((p) => names.has(norm(p)) || String(p).split(/[\s|/,()\[\]-]+/).some((w) => w.length > 2 && names.has(norm(w))))) continue;
          people.push({ id: u.id, name: m.nick || u.global_name || u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : "" });
        }
        if (list.length < 1000) break;
        after = list[list.length - 1].user.id;
      }
    }
    people.sort((a, b) => a.name.localeCompare(b.name));
    out.newcomers = people;
    try { out.config = await rpc("bot_config", { p_key: key }); } catch { out.config = null; }

    if (action === "newcomers-post") {
      if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
      let b = {}; try { b = JSON.parse(event.body || "{}"); } catch {}
      const channel = /^\d{5,25}$/.test(String(b.channel || "")) ? String(b.channel) : (out.config && out.config.feed_channel) || "";
      if (!channel) return json(200, { ...out, error: "Pick a channel for the bot to post in." });
      const want = new Set((Array.isArray(b.ids) ? b.ids : []).map(String));
      const ids = people.filter((p) => want.has(p.id)).map((p) => p.id); // only people who really are newcomers
      if (!ids.length) return json(200, { ...out, error: "Tick at least one person to invite." });
      const note = String(b.note || "").trim().slice(0, 300);
      const chunks = []; for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
      try {
        for (let i = 0; i < chunks.length; i++) {
          const tags = chunks[i].map((id) => `<@${id}>`).join(" ");
          const msg = { allowed_mentions: { parse: [], users: chunks[i] }, content: i === 0 ? `🛡️ **Hold there, travellers!** ${tags}` : tags };
          if (i === chunks.length - 1) {
            msg.embeds = [{
              title: "Your name isn't in the hall's ledger yet", url: cfg.site + "/", color: 0xe3b55b,
              description: (note ? note + "\n\n" : "") +
                "The guard at the gate says the **Bark and Stone** hall has a place for you. Come and have a look:\n\n" +
                "⚒️ Find who can craft what, and post jobs on the **Request Board**\n" +
                "💰 Buy and sell on the guild **market**\n" +
                "📅 Sign up for **dungeons, raids and events**\n" +
                "🏆 Earn **achievements** that sync from your Armory as you play\n" +
                "🗺️ The world map, Loot Vault, guides and guild news\n\n" +
                "Signing up takes a minute. Add your main character and you're in the guild roster.",
              footer: { text: "Bark and Stone · guild website" },
            }];
            msg.components = [{ type: 1, components: [{ type: 2, style: 5, label: "Visit the guild hall", url: cfg.site + "/" }] }];
          }
          await discordApi(cfg, "POST", `/channels/${channel}/messages`, msg);
        }
      } catch (e) {
        return json(200, { ...out, error: e.status === 403 ? "The bot isn't allowed to post in that channel. Pick another, or ask a Discord admin to let the bot send messages there." : "Discord didn't take the message: " + e.message });
      }
      out.posted = ids.length;
    }
    return json(200, out);
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
