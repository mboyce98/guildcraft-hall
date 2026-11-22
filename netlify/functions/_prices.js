// /price in Discord: an item's picture, what guildmates have seen it sell for, the trend, and guild market listings.
const DAY = 86400000;
const QUALITY_COLOR = [0x9d9d9d, 0xffffff, 0x1eff00, 0x0070dd, 0xa335ee, 0xff8000];
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const coins = (g) => {
  const c = Math.round((Number(g) || 0) * 10000); if (c <= 0) return "—";
  return [Math.floor(c / 10000) && Math.floor(c / 10000).toLocaleString("en-US") + "g", Math.floor((c % 10000) / 100) && Math.floor((c % 10000) / 100) + "s", c % 100 && (c % 100) + "c"].filter(Boolean).join(" ");
};
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

// Every item name in the game data, from the website's own recipes.json (kept between calls).
let ITEMS = null;
async function items(site) {
  if (ITEMS) return ITEMS;
  const d = await (await fetch(site + "/recipes.json")).json();
  ITEMS = new Map();
  for (const [id, v] of Object.entries(d.items || {})) if (!ITEMS.has(v[0].toLowerCase())) ITEMS.set(v[0].toLowerCase(), { id: Number(id), name: v[0], q: v[1] });
  return ITEMS;
}

// Item picture and quality from Wowhead's WoW Forever tooltips.
async function wowheadItem(id) {
  try {
    const r = await Promise.race([fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}`), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 1200))]);
    const d = await r.json();
    return d && d.icon ? { icon: `https://wow.zamimg.com/images/wow/icons/large/${d.icon}.jpg`, q: d.quality, name: d.name } : null;
  } catch { return null; }
}

// A small trend line in text: one bar per day that had reports, over the last 30 days.
function sparkText(reports) {
  const now = Date.now(), days = [];
  for (let d = 29; d >= 0; d--) {
    const v = reports.filter((p) => p.t > now - (d + 1) * DAY && p.t <= now - d * DAY).map((p) => p.v);
    if (v.length) days.push(median(v));
  }
  if (days.length < 2) return "";
  const lo = Math.min(...days), hi = Math.max(...days), bars = "▁▂▃▄▅▆▇█";
  return days.map((v) => bars[hi === lo ? 3 : Math.round((v - lo) / (hi - lo) * 7)]).join("");
}

function priceEmbed({ query, info, wh, data, site }) {
  const name = (wh && wh.name) || (info && info.name) || query;
  const now = Date.now();
  const reps = (data.reports || []).map((p) => ({ v: Number(p.price), t: Date.parse(p.at), s: p.source }));
  const wk = reps.filter((p) => p.t > now - 7 * DAY).map((p) => p.v), prev = reps.filter((p) => p.t <= now - 7 * DAY && p.t > now - 14 * DAY).map((p) => p.v);
  const m30 = reps.filter((p) => p.t > now - 30 * DAY).map((p) => p.v);
  const typical = wk.length ? median(wk) : reps.length ? median(reps.slice(0, 5).map((p) => p.v)) : 0;
  const change = wk.length && prev.length ? median(wk) / median(prev) - 1 : null;
  const chg = change == null ? "Not enough reports to compare" : `${change > 0.02 ? "▲" : change < -0.02 ? "▼" : "■"} ${Math.abs(Math.round(change * 100))}% ${change > 0.02 ? "up" : change < -0.02 ? "down" : "steady"}`;
  const spark = sparkText(reps);
  const sell = (data.listings || []).filter((l) => l.type === "S"), buy = (data.listings || []).filter((l) => l.type === "B");
  const row = (l) => `**${l.char}** ×${l.qty} · ${coins(l.price)} each${l.note ? ` · ${clip(l.note, 40)}` : ""}`;
  const fields = [];
  if (reps.length) {
    fields.push({ name: wk.length ? "Typical price this week" : "Last seen around", value: `**${coins(typical)}** each`, inline: true });
    fields.push({ name: "vs last week", value: chg, inline: true });
    if (m30.length) fields.push({ name: "30-day range", value: `${coins(Math.min(...m30))} – ${coins(Math.max(...m30))}`, inline: true });
    if (spark) fields.push({ name: "Last 30 days", value: "`" + spark + "`" });
    fields.push({ name: "Latest reports", value: clip(reps.slice(0, 4).map((p) => `${coins(p.v)} · ${p.s} · <t:${Math.floor(p.t / 1000)}:R>`).join("\n"), 1000) });
  }
  if (sell.length) fields.push({ name: `For sale on the guild market (${sell.length})`, value: clip(sell.slice(0, 6).map(row).join("\n"), 1000) });
  if (buy.length) fields.push({ name: `Wanted on the guild market (${buy.length})`, value: clip(buy.slice(0, 6).map(row).join("\n"), 1000) });
  const q = wh && wh.q != null ? wh.q : info ? info.q : 1;
  return {
    title: name,
    url: info ? `https://www.wowhead.com/forever/item=${info.id}` : `${site}/#prices`,
    color: QUALITY_COLOR[q] != null ? QUALITY_COLOR[q] : 0xe3b55b,
    thumbnail: wh && wh.icon ? { url: wh.icon } : undefined,
    description: reps.length || sell.length || buy.length ? (reps.length ? `From ${reps.length} price report${reps.length === 1 ? "" : "s"} by guildmates in the last 60 days.` : "")
      : `Nobody in the guild has reported a price for this yet. Seen it in Trade chat or the auction house? Report it at ${site}/#prices`,
    fields,
    footer: { text: "Report prices on the website: Guides → Market prices" },
  };
}

module.exports = { items, wowheadItem, priceEmbed };
