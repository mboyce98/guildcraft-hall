// The database calls this when something new is posted on the site (market listing, board job, news, guide,
// event, new member). It collects that one waiting post and sends it to the feed channel as the bot.
// Each post can only be collected once, so calling this address again does nothing.
const { json } = require("./_shared");
const { dcfg, dataKey, rpc, discordApi } = require("./_discord");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  const cfg = dcfg();
  if (!cfg.token) return json(200, { sent: false });
  let id = 0; try { id = Number(JSON.parse(event.body || "{}").id); } catch {}
  if (!(id > 0)) return json(400, { error: "Which post?" });
  try {
    const job = await rpc("bot_outbox_take", { p_key: dataKey(cfg), p_id: id });
    if (!job || !job.channel) return json(200, { sent: false });
    await discordApi(cfg, "POST", `/channels/${job.channel}/messages`, job.payload);
    return json(200, { sent: true });
  } catch (e) {
    console.error("feed-post", e.status, e.message);
    return json(200, { sent: false });
  }
};
