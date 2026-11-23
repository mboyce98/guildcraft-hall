/* Bark and Stone — Loot & Mounts page (#mounts).
   Mounts: a hand-kept list of WoW Forever mounts and how to get them (from Forever guides, late Oct to Nov 2026;
   some details aren't confirmed by Blizzard yet and are marked so).
   Loot: the best dungeon drops for each level bracket, read from loot-items.json (the same data as the Loot Vault). */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = document.getElementById("view-mounts"); if (!root) return;

// [name, kind, faction A/H/B, speed %, level, source, where, new in Forever, note]
const MOUNTS = [
  // Alliance racial vendors
  ["Brown Horse", "horse", "A", 60, 40, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Chestnut Mare", "horse", "A", 60, 40, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Pinto", "horse", "A", 60, 40, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Black Stallion", "horse", "A", 60, 40, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Swift Brown Steed", "horse", "A", 100, 60, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Swift Palomino", "horse", "A", 100, 60, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Swift White Steed", "horse", "A", 100, 60, "Vendor", "Katie Hunter, Eastvale Logging Camp, Elwynn Forest", 0],
  ["Gray Ram", "ram", "A", 60, 40, "Vendor", "Veron Amberstill, Amberstill Ranch, Dun Morogh", 0],
  ["White Ram", "ram", "A", 60, 40, "Vendor", "Veron Amberstill, Amberstill Ranch, Dun Morogh", 0],
  ["Brown Ram", "ram", "A", 60, 40, "Vendor", "Veron Amberstill, Amberstill Ranch, Dun Morogh", 0],
  ["Swift Brown Ram", "ram", "A", 100, 60, "Vendor", "Veron Amberstill, Amberstill Ranch, Dun Morogh", 0],
  ["Swift Gray Ram", "ram", "A", 100, 60, "Vendor", "Veron Amberstill, Amberstill Ranch, Dun Morogh", 0],
  ["Swift White Ram", "ram", "A", 100, 60, "Vendor", "Veron Amberstill, Amberstill Ranch, Dun Morogh", 0],
  ["Striped Frostsaber", "saber", "A", 60, 40, "Vendor", "Lelanai, Cenarion Enclave, Darnassus", 0],
  ["Spotted Frostsaber", "saber", "A", 60, 40, "Vendor", "Lelanai, Cenarion Enclave, Darnassus", 0],
  ["Striped Nightsaber", "saber", "A", 60, 40, "Vendor", "Lelanai, Cenarion Enclave, Darnassus", 0],
  ["Swift Frostsaber", "saber", "A", 100, 60, "Vendor", "Lelanai, Cenarion Enclave, Darnassus", 0],
  ["Swift Mistsaber", "saber", "A", 100, 60, "Vendor", "Lelanai, Cenarion Enclave, Darnassus", 0],
  ["Swift Stormsaber", "saber", "A", 100, 60, "Vendor", "Lelanai, Cenarion Enclave, Darnassus", 0],
  ["Blue Mechanostrider", "mechanostrider", "A", 60, 40, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  ["Green Mechanostrider", "mechanostrider", "A", 60, 40, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  ["Red Mechanostrider", "mechanostrider", "A", 60, 40, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  ["Unpainted Mechanostrider", "mechanostrider", "A", 60, 40, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  ["Swift Green Mechanostrider", "mechanostrider", "A", 100, 60, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  ["Swift White Mechanostrider", "mechanostrider", "A", 100, 60, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  ["Swift Yellow Mechanostrider", "mechanostrider", "A", 100, 60, "Vendor", "Milli Featherwhistle, Steelgrill's Depot, Dun Morogh", 0],
  // Horde racial vendors
  ["Timber Wolf", "wolf", "H", 60, 40, "Vendor", "Ogunaro Wolfrunner, Valley of Honor, Orgrimmar", 0],
  ["Dire Wolf", "wolf", "H", 60, 40, "Vendor", "Ogunaro Wolfrunner, Valley of Honor, Orgrimmar", 0],
  ["Brown Wolf", "wolf", "H", 60, 40, "Vendor", "Ogunaro Wolfrunner, Valley of Honor, Orgrimmar", 0],
  ["Swift Brown Wolf", "wolf", "H", 100, 60, "Vendor", "Ogunaro Wolfrunner, Valley of Honor, Orgrimmar", 0],
  ["Swift Gray Wolf", "wolf", "H", 100, 60, "Vendor", "Ogunaro Wolfrunner, Valley of Honor, Orgrimmar", 0],
  ["Swift Timber Wolf", "wolf", "H", 100, 60, "Vendor", "Ogunaro Wolfrunner, Valley of Honor, Orgrimmar", 0],
  ["Black Skeletal Horse", "skeletal horse", "H", 60, 40, "Vendor", "Zachariah Post, Brill, Tirisfal Glades", 0],
  ["Blue Skeletal Horse", "skeletal horse", "H", 60, 40, "Vendor", "Zachariah Post, Brill, Tirisfal Glades", 0],
  ["Brown Skeletal Horse", "skeletal horse", "H", 60, 40, "Vendor", "Zachariah Post, Brill, Tirisfal Glades", 0],
  ["Red Skeletal Horse", "skeletal horse", "H", 60, 40, "Vendor", "Zachariah Post, Brill, Tirisfal Glades", 0],
  ["Green Skeletal Warhorse", "skeletal horse", "H", 100, 60, "Vendor", "Zachariah Post, Brill, Tirisfal Glades", 0],
  ["Purple Skeletal Warhorse", "skeletal horse", "H", 100, 60, "Vendor", "Zachariah Post, Brill, Tirisfal Glades", 0],
  ["Brown Kodo", "kodo", "H", 60, 40, "Vendor", "Harb Clawhoof, Bloodhoof Village, Mulgore", 0],
  ["Gray Kodo", "kodo", "H", 60, 40, "Vendor", "Harb Clawhoof, Bloodhoof Village, Mulgore", 0],
  ["Great Brown Kodo", "kodo", "H", 100, 60, "Vendor", "Harb Clawhoof, Bloodhoof Village, Mulgore", 0],
  ["Great Gray Kodo", "kodo", "H", 100, 60, "Vendor", "Harb Clawhoof, Bloodhoof Village, Mulgore", 0],
  ["Great White Kodo", "kodo", "H", 100, 60, "Vendor", "Harb Clawhoof, Bloodhoof Village, Mulgore", 0],
  ["Emerald Raptor", "raptor", "H", 60, 40, "Vendor", "Zjolnir, Sen'jin Village, Durotar", 0],
  ["Turquoise Raptor", "raptor", "H", 60, 40, "Vendor", "Zjolnir, Sen'jin Village, Durotar", 0],
  ["Violet Raptor", "raptor", "H", 60, 40, "Vendor", "Zjolnir, Sen'jin Village, Durotar", 0],
  ["Swift Blue Raptor", "raptor", "H", 100, 60, "Vendor", "Zjolnir, Sen'jin Village, Durotar", 0],
  ["Swift Olive Raptor", "raptor", "H", 100, 60, "Vendor", "Zjolnir, Sen'jin Village, Durotar", 0],
  ["Swift Orange Raptor", "raptor", "H", 100, 60, "Vendor", "Zjolnir, Sen'jin Village, Durotar", 0],
  // Skyborne (new)
  ["Empyrean Galestrider", "galestrider", "B", 60, 40, "Vendor", "Genn Fairweather, Zephras Isle (Skyborne only, needs Galestrider Riding)", 1, "Vendor and price come from one guide; Blizzard hasn't announced how to get Galestriders."],
  ["Stormy Galestrider", "galestrider", "B", 60, 40, "Vendor", "Genn Fairweather, Zephras Isle (Skyborne only, needs Galestrider Riding)", 1, "Not confirmed by Blizzard yet."],
  ["Umber Galestrider", "galestrider", "B", 60, 40, "Vendor", "Genn Fairweather, Zephras Isle (Skyborne only, needs Galestrider Riding)", 1, "Not confirmed by Blizzard yet."],
  ["Swift Empyrean Galestrider", "galestrider", "B", 100, 60, "Vendor", "Genn Fairweather, Zephras Isle (Skyborne only)", 1, "Not confirmed by Blizzard yet."],
  ["Swift Stormy Galestrider", "galestrider", "B", 100, 60, "Vendor", "Genn Fairweather, Zephras Isle (Skyborne only)", 1, "Not confirmed by Blizzard yet."],
  ["Swift Umber Galestrider", "galestrider", "B", 100, 60, "Vendor", "Genn Fairweather, Zephras Isle (Skyborne only)", 1, "Not confirmed by Blizzard yet."],
  // Class mounts
  ["Summon Warhorse", "horse", "A", 60, 40, "Class", "Paladin class quest (Human and Dwarf Paladins)", 0],
  ["Summon Charger", "horse", "A", 100, 60, "Class", "Paladin epic quest chain, finishing in Scholomance", 0],
  ["Summon Warhorse (Forsaken)", "skeletal horse", "H", 60, 40, "Class", "Undead Paladin class quest", 1, "Shown at BlizzCon; the quest hasn't been published yet."],
  ["Summon Forsaken Charger", "skeletal horse", "H", 100, 60, "Class", "Undead Paladin level 60 class quest", 1],
  ["Summon Felsteed", "felsteed", "B", 60, 40, "Class", "Warlock class quest from your Warlock trainer", 0],
  ["Summon Dreadsteed", "felsteed", "B", 100, 60, "Class", "Warlock epic quest chain, finishing in Dire Maul", 0],
  // Reputation and supplies
  ["Reins of the Pack Kodo", "kodo", "B", 100, 60, "Reputation", "Exalted with your supply reputation, then 6,000 Merchant's Favor. Alliance: Huey Sunnydale, Redridge Mountains. Horde: Okamache, the Barrens", 1, "Needs Journeyman Riding."],
  ["Reins of the Winterspring Frostsaber", "saber", "A", 100, 60, "Reputation", "Exalted with the Wintersaber Trainers, Rivern Frostwind, Winterspring", 0],
  ["Stormpike Battle Charger", "ram", "A", 100, 60, "Reputation", "Exalted with the Stormpike Guard (Alterac Valley)", 0],
  ["Horn of the Frostwolf Howler", "wolf", "H", 100, 60, "Reputation", "Exalted with the Frostwolf Clan (Alterac Valley)", 0],
  // PvP
  ["Black War Steed", "horse", "A", 100, 60, "PvP", "PvP rank 11, Lieutenant Karter, Stormwind", 0],
  ["Black War Ram", "ram", "A", 100, 60, "PvP", "PvP rank 11, Lieutenant Karter, Stormwind", 0],
  ["Black War Tiger", "saber", "A", 100, 60, "PvP", "PvP rank 11, Lieutenant Karter, Stormwind", 0],
  ["Black Battlestrider", "mechanostrider", "A", 100, 60, "PvP", "PvP rank 11, Lieutenant Karter, Stormwind", 0],
  ["Black War Wolf", "wolf", "H", 100, 60, "PvP", "PvP rank 11, Raider Bork, Orgrimmar", 0],
  ["Red Skeletal Warhorse", "skeletal horse", "H", 100, 60, "PvP", "PvP rank 11, Raider Bork, Orgrimmar", 0],
  ["Black War Kodo", "kodo", "H", 100, 60, "PvP", "PvP rank 11, Raider Bork, Orgrimmar", 0],
  ["Black War Raptor", "raptor", "H", 100, 60, "PvP", "PvP rank 11, Raider Bork, Orgrimmar", 0],
  // Drops
  ["Deathcharger's Reins", "skeletal horse", "B", 100, 60, "Drop", "Rare drop from Baron Rivendare, Stratholme", 0],
  ["Swift Razzashi Raptor", "raptor", "B", 100, 60, "Drop", "Rare drop from Bloodlord Mandokir, Zul'Gurub", 0],
  ["Swift Zulian Tiger", "tiger", "B", 100, 60, "Drop", "Rare drop from High Priest Thekal, Zul'Gurub", 0],
  ["Black Qiraji Resonating Crystal", "qiraji", "B", 100, 60, "Drop", "Drop from C'Thun, Temple of Ahn'Qiraj", 0, "In the original game it only worked inside Ahn'Qiraj until later patches."],
  ["Blue, Green, Red and Yellow Qiraji Resonating Crystals", "qiraji", "B", 100, 60, "Drop", "Drops from trash in the Temple of Ahn'Qiraj", 0, "Only usable inside the Temple of Ahn'Qiraj."],
  // Editions and rewards
  ["Cerulean Prideclaw", "saber", "B", 100, 60, "Edition", "Skyborne Heroic Pack or a higher edition", 1, "Needs Journeyman Riding."],
  ["Veteran Adventurer's Loyal Companion", "bear", "B", 60, 40, "Edition", "Skyborne Epic Pack or the Warcraft Forever Collection", 1, "A rideable bear from level 40."],
  ["Reins of the Spectral Bear", "bear", "B", 100, 60, "Legacy", "Legacy reward for 55 Legacy Points, account-wide", 1, "Needs Journeyman Riding."],
];
const ICON = { horse: "🐎", ram: "🐏", saber: "🐆", tiger: "🐅", mechanostrider: "⚙️", wolf: "🐺", "skeletal horse": "💀", kodo: "🦬", raptor: "🦖", galestrider: "🪶", felsteed: "🔥", qiraji: "🪲", bear: "🐻" };
const SOURCES = ["Vendor", "Class", "Reputation", "PvP", "Drop", "Edition", "Legacy"];
const SRC_HELP = { Vendor: "Buy from a mount vendor once you have the riding skill", Class: "Earned through a class quest", Reputation: "Earned with reputation", PvP: "Earned through PvP rank", Drop: "Drops from a boss", Edition: "Comes with a WoW Forever edition", Legacy: "A Legacy reward" };

const st = { tab: "mounts", q: "", faction: "A", src: "", speed: "", onlyNew: false, lvBand: "", sel: null };
try { st.faction = localStorage.getItem("gc.mount.faction") || "A"; st.lvBand = localStorage.getItem("gc.loot.band") || ""; } catch {}

const facLabel = { A: "Alliance", H: "Horde", B: "Both factions" };
// Wowhead item or spell for each mount, with its icon (made by tools/mount-icons.ps1).
let WH = {}, whLoading = null;
function loadWh() {
  if (whLoading) return whLoading;
  whLoading = fetch("mount-icons.json?v=1").then((r) => r.json()).then((d) => { WH = d || {}; render(); }).catch(() => {});
  return whLoading;
}
const wh = (name) => {
  const w = WH[name];
  return w ? `https://www.wowhead.com/forever/${w.t}=${w.id}` : `https://www.wowhead.com/forever/search?q=${encodeURIComponent(name)}`;
};
const icon = (m) => {
  const w = WH[m[0]];
  return w && /^[a-z0-9_]+$/i.test(w.icon)
    ? `<img src="https://wow.zamimg.com/images/wow/icons/large/${w.icon}.jpg" alt="" width="46" height="46" loading="lazy">`
    : ICON[m[1]] || "🐴";
};

function mountList() {
  const q = st.q.trim().toLowerCase();
  return MOUNTS.filter((m) => (!st.faction || m[2] === st.faction || m[2] === "B")
    && (!st.src || m[5] === st.src) && (!st.speed || String(m[3]) === st.speed) && (!st.onlyNew || m[7])
    && (!q || (m[0] + " " + m[1] + " " + m[6]).toLowerCase().includes(q)));
}

function mountsHtml() {
  const list = mountList();
  const chip = (k, v, label, cur) => `<button class="chip" data-mt="${k}" data-v="${esc(v)}" aria-pressed="${cur === v}">${label}</button>`;
  return `
    <div class="mt-riding">
      <div class="mt-ride"><b>40</b><span><strong>Apprentice Riding</strong><br>+60% speed. Your first mount. Guides report 100 gold.</span></div>
      <div class="mt-ride"><b>60</b><span><strong>Journeyman Riding</strong><br>+100% speed for swift (epic) mounts. Guides report 1,000 gold.</span></div>
      <p class="muted small">Blizzard hasn't published riding prices, so the gold costs come from guides. In Forever, racial vendor mounts are bind-on-pickup and there are no flying mounts. Start saving early: the guild market and Request Board are good places to earn.</p>
    </div>
    <div class="mt-filters">
      <div class="chips">${chip("faction", "A", "Alliance", st.faction)}${chip("faction", "H", "Horde", st.faction)}${chip("faction", "", "All", st.faction)}</div>
      <div class="chips">${chip("src", "", "Any source", st.src)}${SOURCES.map((s) => chip("src", s, s, st.src)).join("")}</div>
      <div class="chips">${chip("speed", "", "Any speed", st.speed)}${chip("speed", "60", "Normal (40)", st.speed)}${chip("speed", "100", "Swift (60)", st.speed)}
        <button class="chip" data-mt="onlyNew" aria-pressed="${st.onlyNew}">✦ New in Forever</button></div>
      <input type="search" id="mt-q" value="${esc(st.q)}" placeholder="Search mounts, vendors or places" aria-label="Search mounts">
    </div>
    <p class="muted small" aria-live="polite">${list.length} mount${list.length === 1 ? "" : "s"}</p>
    <div class="mt-grid">${list.map((m) => `
      <article class="mt-card ${m[3] === 100 ? "epic" : "rare"}">
        <a class="mt-ico" href="${wh(m[0])}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${icon(m)}</a>
        <div class="mt-body">
          <h4><a href="${wh(m[0])}" target="_blank" rel="noopener" data-wh-icon-size="tiny" data-wh-rename-link="false">${esc(m[0])}</a>${m[7] ? ' <span class="new-pill">New</span>' : ""}</h4>
          <p class="mt-meta"><span class="tag ${m[2] === "A" ? "ally" : m[2] === "H" ? "horde" : ""}">${facLabel[m[2]]}</span> <span title="${esc(SRC_HELP[m[5]])}">${esc(m[5])}</span> · ${m[3] === 100 ? "Swift, +100%" : "+60%"} · level ${m[4]}</p>
          <p class="mt-where">${esc(m[6])}</p>
          ${m[8] ? `<p class="mt-note">${esc(m[8])}</p>` : ""}
        </div>
      </article>`).join("") || `<div class="card empty"><strong>No mounts match.</strong>Try a different filter.</div>`}</div>
    <p class="muted small">Names link to Wowhead's WoW Forever database. Mount lists come from WoW Forever guides and the original game. Some new mounts aren't confirmed by Blizzard yet, so their notes say so.</p>`;
}

/* ---------- Loot: best drops per level bracket ---------- */
const BANDS = [["10-19", 10, 19], ["20-29", 20, 29], ["30-39", 30, 39], ["40-49", 40, 49], ["50-60", 50, 60]];
const QUAL = { 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };
const SLOTN = { 1: "Head", 2: "Neck", 3: "Shoulder", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist", 10: "Hands", 11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Off Hand", 15: "Ranged", 16: "Back", 17: "Two-Hand", 20: "Chest", 21: "Main Hand", 22: "Off Hand", 23: "Held In Off-hand", 25: "Thrown", 26: "Ranged" };
let LOOT = null, lootLoading = null;
function loadLoot() {
  if (lootLoading) return lootLoading;
  lootLoading = fetch("loot-items.json?v=1").then((r) => r.json()).then((d) => { LOOT = d; render(); }).catch(() => { LOOT = []; render(); });
  return lootLoading;
}
function myBand() {
  if (st.lvBand) return st.lvBand;
  const lv = (window.GC_AI && window.GC_AI.guard && window.GC_AI.guard().level) || 0;
  const b = BANDS.find(([, a, z]) => lv >= a && lv <= z);
  return b ? b[0] : "20-29";
}
function lootHtml() {
  const band = myBand(), [, lo, hi] = BANDS.find((b) => b[0] === band);
  const chips = BANDS.map(([k]) => `<button class="chip" data-mt="band" data-v="${k}" aria-pressed="${band === k}">Levels ${k}</button>`).join("");
  if (!LOOT) { loadLoot(); return `<div class="chips">${chips}</div><p class="muted">Opening the vault…</p>`; }
  // Rare and epic drops from named bosses and creatures in this bracket, best item level first.
  const rows = LOOT.filter((r) => r[7] >= lo && r[7] <= hi && r[2] >= 3 && r[9] && String(r[8]).split(".").includes("2"))
    .sort((a, b) => a[7] - b[7] || b[2] - a[2] || b[6] - a[6]);
  // Spread across the bracket: the best few for each level, at most two from any one boss.
  const seenBoss = new Map(), perLevel = new Map(), pick = [];
  for (const r of rows) {
    const n = seenBoss.get(r[9]) || 0, l = perLevel.get(r[7]) || 0;
    if (n >= 2 || l >= 3) continue;
    seenBoss.set(r[9], n + 1); perLevel.set(r[7], l + 1); pick.push(r);
    if (pick.length >= 30) break;
  }
  return `<div class="chips">${chips}</div>
    <p class="muted small">Rare and epic drops for levels ${band}, lowest level first, the best few at each level. Hover a name on Wowhead for full stats, or search everything in the <a href="#loot">Loot Vault</a>.</p>
    <div class="lt-grid">${pick.map((r) => `<a class="lt-card q${r[2]}" href="https://www.wowhead.com/forever/item=${r[0]}" target="_blank" rel="noopener">
        <strong class="q${r[2]}">${esc(r[1])}</strong>
        <span class="small">${esc(SLOTN[r[3]] || "")} · needs level ${r[7]} · item level ${r[6]}</span>
        <span class="small muted">Drops from ${esc(r[9])}</span>
        <span class="lt-q">${QUAL[r[2]] || ""}</span></a>`).join("") || `<p class="muted">No rare drops found for this bracket.</p>`}</div>`;
}

function render() {
  if (root.hidden && root.dataset.built) return;
  loadWh();
  const active = document.activeElement && document.activeElement.id === "mt-q";
  root.dataset.built = "1";
  root.innerHTML = `
    <div class="lm-head">
      <div><p class="eyebrow">Bark and Stone · Treasures of Azeroth</p><h2 class="hero-title">Loot and mounts</h2>
      <p class="muted map-intro">Every way to get a mount in WoW Forever, and the best drops to chase at your level.</p></div>
      <div class="lm-tabs" role="tablist">
        <button class="chip" role="tab" data-mt="tab" data-v="mounts" aria-selected="${st.tab === "mounts"}" aria-pressed="${st.tab === "mounts"}">🐎 Mounts</button>
        <button class="chip" role="tab" data-mt="tab" data-v="loot" aria-selected="${st.tab === "loot"}" aria-pressed="${st.tab === "loot"}">💎 Best loot for your level</button>
        <a class="chip" href="#loot">🔍 Full Loot Vault</a>
      </div>
    </div>
    ${st.tab === "mounts" ? mountsHtml() : lootHtml()}`;
  if (active) { const q = $("#mt-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}

root.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mt]"); if (!b) return;
  const k = b.dataset.mt, v = b.dataset.v;
  if (k === "onlyNew") st.onlyNew = !st.onlyNew;
  else if (k === "faction") { st.faction = v; try { localStorage.setItem("gc.mount.faction", v); } catch {} }
  else if (k === "band") { st.lvBand = v; try { localStorage.setItem("gc.loot.band", v); } catch {} }
  else st[k] = v;
  render();
});
root.addEventListener("input", (e) => { if (e.target.id === "mt-q") { st.q = e.target.value; render(); } });

window.GC_MOUNTS = { render };
})();
