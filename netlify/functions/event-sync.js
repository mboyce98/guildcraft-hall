// The website calls this after an event is planned, changed, or someone signs up there, so the
// event's post in Discord shows the same roster. POST {id} to post/update, {id, action:"delete"} before deleting.
const { SUPABASE_URL, SUPABASE_PUBLISHABLE, json } = require("./_shared");
const { dcfg, dataKey, rpc, discordApi } = require("./_discord");
const { eventMessage } = require("./_events");

async function userFrom(event) {
  const jwt = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const u = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: "Bearer " + jwt } });
  if (!u.ok) return null;
  const { id } = await u.json();
  const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(id)}`, { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: "Bearer " + jwt } });
  const rows = p.ok ? await p.json() : [];
  return { id, admin: !!(rows[0] && rows[0].is_admin) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  const me = await userFrom(event).catch(() => null);
  if (!me) return json(401, { error: "Sign in first." });
  const cfg = dcfg();
  if (!cfg.appId || !cfg.token) return json(200, { posted: false, reason: "The Discord bot isn't set up." });
  let input = {}; try { input = JSON.parse(event.body || "{}"); } catch {}
  const id = Number(input.id);
  if (!(id > 0)) return json(400, { error: "Which event?" });
  const key = dataKey(cfg);

  let ev, conf;
  try { [ev, conf] = await Promise.all([rpc("bot_event_get", { p_key: key, p_event: id }), rpc("bot_config", { p_key: key })]); }
  catch (e) { return json(200, { posted: false, reason: /Not allowed/.test(e.message) ? "The bot isn't linked to the website yet." : e.message }); }
  if (!ev) return json(404, { error: "That event is gone." });

  if (input.action === "delete") {
    if (ev.created_by !== me.id && !me.admin) return json(403, { error: "Only the host or an admin can delete this event." });
    if (ev.discord_message_id) await discordApi(cfg, "DELETE", `/channels/${ev.discord_channel_id}/messages/${ev.discord_message_id}`).catch(() => {});
    return json(200, { removed: true });
  }

  const body = eventMessage(ev, cfg.site);
  try {
    if (ev.discord_message_id) {
      try { await discordApi(cfg, "PATCH", `/channels/${ev.discord_channel_id}/messages/${ev.discord_message_id}`, body); return json(200, { posted: true, updated: true }); }
      catch (e) { if (e.status !== 404) throw e; } // the post was deleted in Discord: post it again below
    }
    const channel = conf.events_channel;
    if (!channel) return json(200, { posted: false, reason: "No events channel yet. In Discord, type /eventchannel in the channel where events should go." });
    if (ev.cancelled || Date.parse(ev.starts_at) + ev.duration_min * 60000 < Date.now()) return json(200, { posted: false, reason: "Event is over or cancelled." });
    const msg = await discordApi(cfg, "POST", `/channels/${channel}/messages`, body);
    await rpc("bot_event_set_message", { p_key: key, p_event: id, p_channel: channel, p_message: msg.id });
    return json(200, { posted: true });
  } catch (e) {
    console.error("event-sync", e.status, e.message);
    return json(200, { posted: false, reason: e.status === 403 ? "The bot isn't allowed to post in the events channel." : "Discord didn't answer: " + e.message });
  }
};
