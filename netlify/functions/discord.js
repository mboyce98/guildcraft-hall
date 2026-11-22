// The Bark and Stone Discord bot. Discord sends slash commands here (the app's "Interactions Endpoint URL"),
// so the bot needs no server of its own. Every reply must go back within 3 seconds.
const { dcfg, dataKey, verify, rpc } = require("./_discord");

const GOLD = 0xe3b55b;
const json = (body) => ({ statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reply = (data) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });
const oops = (text) => reply({ content: text, flags: 64 }); // only the person who asked sees it
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const gold = (g) => { const c = Math.round((Number(g) || 0) * 10000); if (c <= 0) return "—"; return [Math.floor(c / 10000) && Math.floor(c / 10000) + "g", Math.floor((c % 10000) / 100) && Math.floor((c % 10000) / 100) + "s", c % 100 && (c % 100) + "c"].filter(Boolean).join(" "); };
const opt = (it, name) => ((it.data.options || []).find((o) => o.name === name) || {}).value;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// Recipes come from the website's own recipes.json, kept in memory between calls.
let RECIPES = null;
async function recipes(cfg) {
  if (RECIPES) return RECIPES;
  const d = await (await fetch(cfg.site + "/recipes.json")).json();
  RECIPES = d.recipes.map((a) => ({ id: a[0], name: a[1], prof: d.professions[a[2]] || "", lv: a[3], item: a[5], itemName: (d.items[a[5]] || [""])[0] }));
  RECIPES.forEach((r) => { r.s = (r.name + " " + r.itemName).toLowerCase(); });
  return RECIPES;
}
const snapshot = (cfg) => rpc("bot_snapshot", { p_key: dataKey(cfg) });
const findRecipes = (list, q) => {
  q = String(q || "").trim().toLowerCase();
  if (!q) return list.slice(0, 25);
  const starts = list.filter((r) => r.name.toLowerCase().startsWith(q));
  const has = list.filter((r) => !r.name.toLowerCase().startsWith(q) && r.s.includes(q));
  return [...starts, ...has];
};
const memberLabel = (m) => [m.username, m.char ? `${m.char}${m.surname ? " " + m.surname : ""}` : ""].filter(Boolean).join(" · ");
const findMember = (snap, q) => {
  q = String(q || "").trim().toLowerCase();
  return snap.members.find((m) => m.id === q) || snap.members.find((m) => (m.username || "").toLowerCase() === q || (m.char || "").toLowerCase() === q)
    || snap.members.find((m) => memberLabel(m).toLowerCase().includes(q));
};

async function command(cfg, it) {
  const name = it.data.name;
  if (name === "site") {
    return reply({ embeds: [{ title: "Bark and Stone", url: cfg.site + "/", color: GOLD, description:
      `[Home & news](${cfg.site}/#home) · [Members](${cfg.site}/#members) · [Recipes](${cfg.site}/#recipes)\n[Request Board](${cfg.site}/#board) · [Market](${cfg.site}/#market) · [World map](${cfg.site}/#map) · [Loot Vault](${cfg.site}/#loot)` }] });
  }
  if (name === "wownews") {
    const d = await withTimeout(fetch(cfg.site + "/.netlify/functions/world-news").then((r) => r.json()), 2500);
    const items = (d.items || []).filter((n) => /forever/i.test(n.category + " " + n.title)).slice(0, 5);
    if (!items.length) return oops("No WoW Forever headlines right now.");
    return reply({ embeds: [{ title: "WoW Forever news", url: "https://www.wowhead.com/news", color: GOLD,
      description: items.map((n) => `**[${clip(n.title, 120)}](${n.link})**\n${clip(n.teaser, 140)}`).join("\n\n"),
      thumbnail: items[0].image ? { url: items[0].image } : undefined, footer: { text: "Headlines from Wowhead" } }] });
  }
  if (name === "armory") {
    const q = String(opt(it, "character") || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[\p{L}]{2,24}-[\p{L}'-]{1,40}$/u.test(q)) return oops("Give the character's name and surname, like `Mason Nightwin`.");
    let d;
    try { const r = await withTimeout(fetch(cfg.site + "/.netlify/functions/armory?c=" + encodeURIComponent(q)), 2500); d = await r.json(); if (!r.ok) return oops(d.error || "The Armory didn't have that character."); }
    catch { return oops(`The Armory is slow right now. Try again in a few seconds, or open ${cfg.site}/#members.`); }
    const gear = (d.gear || []).filter((g) => /rare|epic|legendary/.test(g.q)).slice(0, 6).map((g) => `[${g.name}](https://www.wowhead.com/forever/item=${g.id}) · ilvl ${g.ilvl || "?"}`).join("\n");
    const prof = (d.professions || []).map((p) => `${p.name} ${p.skill}/${p.max}`).join(" · ");
    const spec = (d.specs || []).length ? d.specs.map((s) => s.points).join(" / ") : "";
    return reply({ embeds: [{ title: `${d.name} ${d.surname || ""}`.trim(), url: d.armory, color: GOLD,
      description: `Level ${d.level} ${d.race} ${d.cls}${d.guild ? ` of <${d.guild}>` : ""}`,
      thumbnail: d.avatar ? { url: d.avatar } : undefined,
      fields: [
        d.ilvl ? { name: "Item level", value: String(d.ilvl), inline: true } : null,
        spec ? { name: "Talents", value: spec, inline: true } : null,
        prof ? { name: "Professions", value: clip(prof, 1000) } : null,
        gear ? { name: "Best gear", value: clip(gear, 1000) } : null,
      ].filter(Boolean), footer: { text: "From Blizzard's Armory" } }] });
  }

  // Everything below reads guild data from the website.
  let snap;
  try { snap = await withTimeout(snapshot(cfg), 2200); }
  catch (e) { return oops(/Not allowed/.test(e.message) ? "The bot isn't linked to the website yet. An admin needs to press “Set up slash commands” on the site's Admin page." : "The website didn't answer in time. Try again in a moment."); }

  if (name === "news") {
    const n = snap.news || [];
    if (!n.length) return oops("No guild news yet.");
    return reply({ embeds: n.slice(0, 3).map((x) => ({ author: { name: "Guild news · " + x.tag }, title: clip(x.title, 250), url: cfg.site + "/#home", description: clip(x.body, 1000), color: GOLD })) });
  }
  if (name === "board") {
    const b = snap.board || [];
    if (!b.length) return reply({ content: `The Request Board is empty. Post a job at ${cfg.site}/#board` });
    return reply({ embeds: [{ title: "Request Board", url: cfg.site + "/#board", color: 0x4f92dc,
      description: b.slice(0, 15).map((x) => `${x.status === "claimed" ? "🔨" : "📜"} **${clip(x.title, 80)}** ×${x.qty} · offer ${gold(x.offer)} · ${x.author_char || "?"}${x.status === "claimed" ? ` (taken by ${x.claimer_char || "someone"})` : ""}`).join("\n"),
      footer: { text: `${b.filter((x) => x.status === "open").length} open · take a job on the website` } }] });
  }
  if (name === "market") {
    const q = String(opt(it, "item") || "").trim().toLowerCase();
    const l = (snap.listings || []).filter((x) => !q || x.item.toLowerCase().includes(q));
    if (!l.length) return reply({ content: q ? `Nothing on the guild market matches “${clip(q, 40)}”.` : "The guild market is empty." });
    const row = (x) => `**${clip(x.item, 60)}** ×${x.qty} · ${gold(x.price)} · ${x.char}`;
    const sell = l.filter((x) => x.type === "S").slice(0, 10), buy = l.filter((x) => x.type === "B").slice(0, 10);
    return reply({ embeds: [{ title: "Guild market" + (q ? `: ${clip(q, 40)}` : ""), url: cfg.site + "/#market", color: 0x5fd47e,
      fields: [sell.length ? { name: "For sale", value: clip(sell.map(row).join("\n"), 1000) } : null, buy.length ? { name: "Wanted", value: clip(buy.map(row).join("\n"), 1000) } : null].filter(Boolean) }] });
  }
  if (name === "member") {
    const m = findMember(snap, opt(it, "name"));
    if (!m) return oops("No guild member by that name.");
    const c = (snap.crafters || []).find((x) => x.uid === m.id);
    const profs = [];
    for (const [ch, v] of Object.entries((c && c.chars) || {})) for (const [p, x] of Object.entries(v.profs || {})) profs.push(`${p} ${x.skill || ""} (${ch})`);
    return reply({ embeds: [{ title: m.username, url: `${cfg.site}/#member-${m.id}`, color: GOLD,
      description: [m.rank ? `**${m.rank}**` : "", m.char ? `${m.char}${m.surname ? " " + m.surname : ""}${m.level ? ` · level ${m.level}` : ""}${m.cls ? " " + m.cls : ""}` : "No main character set", m.bio ? `\n${clip(m.bio, 300)}` : ""].filter(Boolean).join("\n"),
      fields: [profs.length ? { name: "Crafting", value: clip(profs.join("\n"), 1000) } : null, m.times ? { name: "Usually on", value: clip(m.times, 100), inline: true } : null].filter(Boolean),
      footer: { text: "Send them a private message on the website" } }] });
  }
  if (name === "whocan") {
    const list = await withTimeout(recipes(cfg), 2000);
    const v = String(opt(it, "recipe") || "");
    const r = list.find((x) => String(x.id) === v) || findRecipes(list, v)[0];
    if (!r) return oops("I couldn't find that recipe.");
    const who = [];
    for (const c of snap.crafters || []) for (const [ch, x] of Object.entries(c.chars || {})) for (const [p, pr] of Object.entries(x.profs || {}))
      if ((pr.known || []).includes(r.id)) { const m = snap.members.find((mm) => mm.id === c.uid); who.push(`**${ch}** (${m ? m.username : "member"}) · ${p} ${pr.skill || ""}`); }
    return reply({ embeds: [{ title: r.name, url: `${cfg.site}/#recipe-${r.id}`, color: GOLD,
      description: `${r.prof}${r.lv ? ` · skill ${r.lv}` : ""}${r.item ? ` · makes [${r.itemName}](https://www.wowhead.com/forever/item=${r.item})` : ""}`,
      fields: [{ name: who.length ? `Guild members who can make it (${who.length})` : "Nobody has listed this yet", value: who.length ? clip(who.join("\n"), 1000) : `Post it on the [Request Board](${cfg.site}/#board) and someone may pick it up.` }],
      footer: { text: "Request a craft on the website" } }] });
  }
  return oops("I don't know that command yet.");
}

async function autocomplete(cfg, it) {
  const focused = (it.data.options || []).find((o) => o.focused) || {};
  let choices = [];
  try {
    if (it.data.name === "whocan") {
      const list = await withTimeout(recipes(cfg), 2200);
      choices = findRecipes(list, focused.value).slice(0, 25).map((r) => ({ name: clip(`${r.name} · ${r.prof}${r.lv ? " " + r.lv : ""}`, 100), value: String(r.id) }));
    } else if (it.data.name === "member") {
      const snap = await withTimeout(snapshot(cfg), 2200); const q = String(focused.value || "").toLowerCase();
      choices = snap.members.filter((m) => !q || memberLabel(m).toLowerCase().includes(q)).slice(0, 25).map((m) => ({ name: clip(memberLabel(m), 100), value: m.id }));
    }
  } catch {}
  return json({ type: 8, data: { choices } });
}

exports.handler = async (event) => {
  const cfg = dcfg();
  if (event.httpMethod !== "POST") return { statusCode: 200, headers: { "content-type": "text/plain" }, body: "Bark and Stone Discord bot. Discord talks to this address; there's nothing to see in a browser." };
  if (!verify(cfg, event)) return { statusCode: 401, body: "invalid request signature" };
  const it = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
  if (it.type === 1) return json({ type: 1 }); // Discord checking the address works
  try {
    if (it.type === 2) return await command(cfg, it);
    if (it.type === 4) return await autocomplete(cfg, it);
  } catch (e) { console.error(e); return oops("Something went wrong answering that. Try again in a moment."); }
  return json({ type: 1 });
};
