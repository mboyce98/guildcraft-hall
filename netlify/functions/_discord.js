// Shared helpers for the Discord bot functions (server side only).
const crypto = require("crypto");
const { SUPABASE_URL, SUPABASE_PUBLISHABLE } = require("./_shared");

const v = (name) => String(process.env[name] || "").trim();
const dcfg = () => ({
  appId: v("DISCORD_APP_ID"), publicKey: v("DISCORD_PUBLIC_KEY").toLowerCase(), token: v("DISCORD_BOT_TOKEN"),
  site: (process.env.URL || "https://guildcraft-hall.netlify.app").replace(/\/$/, ""),
});

// The bot reads guild data with a key derived from its own token, so no extra secret has to be set up.
const dataKey = (cfg) => crypto.createHmac("sha256", cfg.token).update("bark-and-stone-bot-data").digest("hex");
const dataKeyHash = (cfg) => crypto.createHash("sha256").update(dataKey(cfg)).digest("hex");

// Discord signs every request; reject anything that isn't from Discord.
function verify(cfg, event) {
  try {
    const sig = event.headers["x-signature-ed25519"], ts = event.headers["x-signature-timestamp"];
    if (!sig || !ts || !/^[0-9a-f]{64}$/.test(cfg.publicKey)) return false;
    const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : Buffer.from(event.body || "", "utf8");
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(cfg.publicKey, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.concat([Buffer.from(ts, "utf8"), body]), key, Buffer.from(sig, "hex"));
  } catch { return false; }
}

async function rpc(name, args, jwt) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: "Bearer " + (jwt || SUPABASE_PUBLISHABLE), "content-type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error((data && data.message) || `database ${r.status}`);
  return data;
}

const discordApi = async (cfg, method, path, body) => {
  const r = await fetch("https://discord.com/api/v10" + path, {
    method, headers: { Authorization: "Bot " + cfg.token, "content-type": "application/json", "user-agent": "DiscordBot (https://guildcraft-hall.netlify.app, 1.0)" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) { const e = new Error((data && data.message) || `Discord said ${r.status}`); e.status = r.status; e.data = data; throw e; }
  return data;
};

// Slash commands the bot offers in the guild's Discord server.
const COMMANDS = [
  { name: "whocan", description: "Find guild members who can craft something", options: [{ type: 3, name: "recipe", description: "Recipe or item name", required: true, autocomplete: true }] },
  { name: "board", description: "Open jobs on the guild Request Board" },
  { name: "market", description: "What's for sale or wanted on the guild market", options: [{ type: 3, name: "item", description: "Only show this item", required: false }] },
  { name: "price", description: "What an item sells for: picture, recent prices, trend and guild market listings", options: [{ type: 3, name: "item", description: "Item name, e.g. Arcanite Bar", required: true, autocomplete: true, max_length: 60 }] },
  { name: "member", description: "Look up a guild member", options: [{ type: 3, name: "name", description: "Username or character", required: true, autocomplete: true }] },
  { name: "armory", description: "Show a WoW Forever character's gear and level", options: [{ type: 3, name: "character", description: "Name and surname, e.g. Mason Nightwin", required: true }] },
  { name: "news", description: "Latest Bark and Stone guild news" },
  { name: "wownews", description: "Latest WoW Forever headlines from Wowhead" },
  { name: "site", description: "Links to the Bark and Stone website" },
  { name: "event", description: "Plan a guild event that people can sign up for", options: [
    { type: 3, name: "title", description: "What it is, e.g. Deadmines run", required: true, max_length: 80 },
    { type: 3, name: "when", description: "e.g. Sat 8pm, tomorrow 7:30pm, 11/29 9pm (guild time)", required: true, max_length: 60 },
    { type: 3, name: "kind", description: "Kind of event", required: false, choices: ["Dungeon", "Raid", "Farming", "Leveling", "PvP", "Social", "Other"].map((k) => ({ name: k, value: k })) },
    { type: 4, name: "size", description: "How many people (default 5)", required: false, min_value: 2, max_value: 40 },
    { type: 3, name: "where", description: "Meeting place or zone", required: false, max_length: 80 },
    { type: 4, name: "hours", description: "How long, in hours (default 2)", required: false, min_value: 1, max_value: 12 },
    { type: 3, name: "note", description: "Anything people should know or bring", required: false, max_length: 500 },
  ] },
  { name: "events", description: "Upcoming guild events and who's going" },
  { name: "feedchannel", description: "Post new market listings, board jobs, news, guides, events and members in this channel", default_member_permissions: "32" },
  { name: "eventchannel", description: "Post guild events from the website in this channel", default_member_permissions: "32", options: [
    { type: 3, name: "timezone", description: "Guild time zone for event times typed in Discord", required: false, choices: require("./_events").TIMEZONES },
  ] },
];

module.exports = { dcfg, dataKey, dataKeyHash, verify, rpc, discordApi, COMMANDS };
