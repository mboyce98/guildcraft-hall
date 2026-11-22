/* Bark and Stone — Loot database: every uncommon-or-better weapon, armor piece and accessory in WoW Forever,
   with where it comes from. Data: loot-items.json (from Wowhead's WoW Forever database, fetched 22 Nov 2026).
   Row: [id, name, quality, slot, class, subclass, itemLevel, reqLevel, sources "2.4", dropName, dropId, dropType, zoneId, dps, armor, speed, isNew] */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SLOT = { 1: "Head", 2: "Neck", 3: "Shoulder", 4: "Shirt", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist", 10: "Hands", 11: "Finger", 12: "Trinket",
  13: "One-Hand", 14: "Off Hand", 15: "Ranged", 16: "Back", 17: "Two-Hand", 19: "Tabard", 20: "Chest", 21: "Main Hand", 22: "Off Hand", 23: "Held In Off-hand", 25: "Thrown", 26: "Ranged", 28: "Relic" };
const ARMOR = { 0: "Miscellaneous", 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 6: "Shield", "-2": "Ring", "-3": "Amulet", "-4": "Trinket", "-5": "Off-hand", "-6": "Cloak", "-8": "Shirt" };
const WEAPON = { 0: "Axe (1H)", 1: "Axe (2H)", 2: "Bow", 3: "Gun", 4: "Mace (1H)", 5: "Mace (2H)", 6: "Polearm", 7: "Sword (1H)", 8: "Sword (2H)", 10: "Staff", 13: "Fist Weapon", 14: "Miscellaneous", 15: "Dagger", 16: "Thrown", 18: "Crossbow", 19: "Wand", 20: "Fishing Pole" };
const SOURCE = { 1: "Crafted", 2: "Drop", 3: "PvP", 4: "Quest", 5: "Vendor", 14: "Black Market", 16: "Fishing" };
const QUAL = { 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };
// Slot filter groups (robes count as chest, held-in-off-hand as off hand).
const SLOT_GROUPS = [["Head", [1]], ["Neck", [2]], ["Shoulder", [3]], ["Back", [16]], ["Chest", [5, 20]], ["Wrist", [9]], ["Hands", [10]], ["Waist", [6]], ["Legs", [7]], ["Feet", [8]],
  ["Finger", [11]], ["Trinket", [12]], ["One-Hand", [13, 21]], ["Two-Hand", [17]], ["Off Hand / Shield", [14, 22, 23]], ["Ranged / Thrown", [15, 25, 26]]];

let ITEMS = null, ZONES = new Map(), loading = null;
const st = { q: "", quality: "", slot: "", type: "", source: "", zone: "", minLv: "", maxLv: "", onlyNew: false, sort: "req", dir: 1, limit: 100, sel: null };

const typeOf = (r) => (r[4] === 2 ? WEAPON[r[5]] || "Weapon" : ARMOR[r[5]] || "Armor");
const zoneName = (id) => (ZONES.get(id) || {}).name || "";
const sources = (r) => String(r[8] || "").split(".").filter(Boolean).map(Number);

function load() {
  if (loading) return loading;
  loading = Promise.all([fetch("loot-items.json?v=1").then((r) => r.json()), fetch("map.json?v=1").then((r) => r.json())]).then(([items, map]) => {
    map.zones.forEach(([id, name, cat, min, max, terr, inst]) => { if (!ZONES.has(id)) ZONES.set(id, { id, name, cat, inst }); });
    const seen = new Set();
    ITEMS = items.filter((r) => (seen.has(r[0]) ? false : seen.add(r[0])));
    ITEMS.forEach((r) => { r.s = (r[1] + " " + (r[9] || "") + " " + zoneName(r[12])).toLowerCase(); });
  });
  return loading;
}

function sourceText(r, short) {
  const src = sources(r);
  if (r[9]) return `${short ? "" : "Drops from "}${esc(r[9])}${r[12] ? ` <span class="muted">· ${esc(zoneName(r[12]))}</span>` : ""}`;
  if (r[12] && src.includes(4)) return `Quest${r[12] ? ` <span class="muted">· ${esc(zoneName(r[12]))}</span>` : ""}`;
  if (src.length) return src.map((s) => SOURCE[s] || "Other").join(", ") + (r[12] ? ` <span class="muted">· ${esc(zoneName(r[12]))}</span>` : "");
  return r[12] ? `<span class="muted">${esc(zoneName(r[12]))}</span>` : `<span class="muted">World drop</span>`;
}

function filtered() {
  const q = st.q.trim().toLowerCase();
  const slots = st.slot ? SLOT_GROUPS.find((g) => g[0] === st.slot)[1] : null;
  const min = Number(st.minLv) || 0, max = Number(st.maxLv) || 99;
  const list = ITEMS.filter((r) =>
    (!st.quality || r[2] === Number(st.quality)) &&
    (!slots || slots.includes(r[3])) &&
    (!st.type || typeOf(r) === st.type) &&
    (!st.source || sources(r).includes(Number(st.source)) || (st.source === "2" && r[9])) &&
    (!st.zone || r[12] === Number(st.zone)) &&
    r[7] >= min && r[7] <= max &&
    (!st.onlyNew || r[16]) &&
    (!q || r.s.includes(q)));
  const key = { name: (r) => r[1], req: (r) => r[7], ilvl: (r) => r[6], q: (r) => r[2], stat: (r) => (r[13] || r[14]) };
  const k = key[st.sort] || key.req;
  return list.sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : a[1].localeCompare(b[1])) * st.dir; });
}

function options(pairs, cur, all) { return `<option value="">${all}</option>` + pairs.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join(""); }

function render() {
  const root = $("#view-loot"); if (!root) return;
  if (!ITEMS) {
    root.innerHTML = `<div class="empty"><strong>Opening the loot vault…</strong>Loading 10,000+ items.</div>`;
    load().then(render).catch(() => { root.innerHTML = `<div class="empty"><strong>The loot list didn't load.</strong>Refresh the page to try again.</div>`; });
    return;
  }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    const types = [...new Set(ITEMS.map(typeOf))].sort();
    const zoneIds = [...new Set(ITEMS.map((r) => r[12]).filter(Boolean))].filter((id) => ZONES.has(id));
    const group = (pred) => zoneIds.filter((id) => pred(ZONES.get(id))).sort((a, b) => zoneName(a).localeCompare(zoneName(b)));
    const dungeons = group((z) => z.cat === 2), raids = group((z) => z.cat === 3), world = group((z) => z.cat !== 2 && z.cat !== 3);
    const og = (label, ids) => ids.length ? `<optgroup label="${label}">${ids.map((id) => `<option value="${id}">${esc(zoneName(id))}</option>`).join("")}</optgroup>` : "";
    root.innerHTML = `
      <div class="page-head"><p class="eyebrow">Bark and Stone · Loot database</p><h2 class="hero-title">The Loot Vault</h2>
        <p class="muted page-intro">Every uncommon-or-better weapon, armor piece and trinket in WoW Forever, and where it comes from. Filter by slot, armor type, dungeon or level, then hover an item for its stats.</p></div>
      <div class="loot-filters panel">
        <input type="search" id="lq" placeholder="Search items, bosses or zones (e.g. Edwin VanCleef, Robe, Deadmines)" aria-label="Search loot">
        <div class="selects">
          <label>Quality<select id="lf-quality">${options(Object.entries(QUAL), st.quality, "Any quality")}</select></label>
          <label>Slot<select id="lf-slot">${options(SLOT_GROUPS.map((g) => [g[0], g[0]]), st.slot, "Any slot")}</select></label>
          <label>Type<select id="lf-type">${options(types.map((t) => [t, t]), st.type, "Any type")}</select></label>
          <label>Source<select id="lf-source">${options([["2", "Drops"], ["4", "Quests"], ["5", "Vendors"], ["1", "Crafted"], ["3", "PvP"], ["16", "Fishing"]], st.source, "Any source")}</select></label>
          <label>Where<select id="lf-zone"><option value="">Anywhere</option>${og("Dungeons", dungeons)}${og("Raids", raids)}${og("Zones", world)}</select></label>
          <label>Level<span class="lvl"><input type="number" id="lf-min" min="1" max="60" placeholder="1" aria-label="Minimum required level"> – <input type="number" id="lf-max" min="1" max="60" placeholder="60" aria-label="Maximum required level"></span></label>
        </div>
        <div class="filter-foot"><label class="chk"><input type="checkbox" id="lf-new"> New in Forever only</label><button class="btn small" data-loot="reset">Clear filters</button></div>
      </div>
      <div class="ledger">
        <div><div class="table-wrap"><table class="loot-table">
          <thead><tr>
            <th><button class="sorth" data-sort="name">Item</button></th>
            <th class="hide-sm"><button class="sorth" data-sort="q">Type</button></th>
            <th><button class="sorth" data-sort="req">Req</button></th>
            <th class="hide-sm"><button class="sorth" data-sort="ilvl">iLvl</button></th>
            <th class="hide-sm">Source</th>
          </tr></thead><tbody id="lbody"></tbody></table></div><div id="lmore"></div></div>
        <aside class="sheet" id="lsheet" aria-label="Item details"></aside>
      </div>`;
    const bind = (id, key, ev = "change") => $(id).addEventListener(ev, (e) => { st[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value; st.limit = 100; draw(); });
    bind("#lq", "q", "input"); bind("#lf-quality", "quality"); bind("#lf-slot", "slot"); bind("#lf-type", "type"); bind("#lf-source", "source"); bind("#lf-zone", "zone");
    bind("#lf-min", "minLv", "input"); bind("#lf-max", "maxLv", "input"); bind("#lf-new", "onlyNew");
  }
  draw();
}

function draw() {
  const list = filtered();
  const shown = list.slice(0, st.limit);
  document.querySelectorAll("#view-loot .sorth").forEach((b) => b.setAttribute("aria-sort", b.dataset.sort === st.sort ? (st.dir > 0 ? "ascending" : "descending") : "none"));
  $("#lbody").innerHTML = shown.length ? shown.map((r) => `<tr class="click" data-item="${r[0]}" aria-selected="${st.sel === r[0]}" tabindex="0">
      <td><a class="wh q${r[2]}" href="https://www.wowhead.com/forever/item=${r[0]}" target="_blank" rel="noopener">${esc(r[1])}</a>${r[16] ? '<span class="tag new">New</span>' : ""}
        <div class="sub-cell">${esc(SLOT[r[3]] || "")}${r[13] ? ` · ${r[13]} dps` : r[14] ? ` · ${r[14]} armor` : ""}</div></td>
      <td class="hide-sm">${esc(typeOf(r))}</td>
      <td class="num">${r[7] || "—"}</td>
      <td class="hide-sm num muted">${r[6] || ""}</td>
      <td class="hide-sm src">${sourceText(r, true)}</td></tr>`).join("")
    : `<tr><td colspan="5"><div class="empty"><strong>No loot matches.</strong>Try fewer filters.</div></td></tr>`;
  $("#lmore").innerHTML = list.length > st.limit ? `<div class="more"><button class="btn" data-loot="more">Show more (${(list.length - st.limit).toLocaleString()} left)</button></div>`
    : `<div class="more muted num">${list.length.toLocaleString()} item${list.length === 1 ? "" : "s"}</div>`;
  sheet();
  try { if (window.$WowheadPower && window.$WowheadPower.refreshLinks) window.$WowheadPower.refreshLinks(); } catch {}
}

function sheet() {
  const el = $("#lsheet");
  const r = st.sel && ITEMS.find((x) => x[0] === st.sel);
  el.dataset.empty = r ? "false" : "true";
  if (!r) { el.innerHTML = `<div class="empty"><strong>Pick an item</strong>See where it drops, who drops it, and ask the guild for it.</div>`; return; }
  const z = ZONES.get(r[12]);
  const npcLink = r[9] && r[10] ? `https://www.wowhead.com/forever/${r[11] === 2 ? "object" : "npc"}=${r[10]}` : "";
  el.innerHTML = `
    <div class="head"><div><h2 class="q${r[2]}">${esc(r[1])}</h2>
      <div class="sub">${QUAL[r[2]] || ""} ${esc(typeOf(r))} · ${esc(SLOT[r[3]] || "")}${r[16] ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
      <button class="btn small close" data-loot="close">Close</button></div>
    <dl class="stats">
      <div><dt>Requires level</dt><dd>${r[7] || "—"}</dd></div>
      <div><dt>Item level</dt><dd>${r[6] || "—"}</dd></div>
      ${r[13] ? `<div><dt>Damage per second</dt><dd>${r[13]}${r[15] ? ` <span class="muted">(speed ${r[15]})</span>` : ""}</dd></div>` : ""}
      ${r[14] ? `<div><dt>Armor</dt><dd>${r[14]}</dd></div>` : ""}
    </dl>
    <details class="dd" open><summary>Where to get it</summary>
      <p>${sourceText(r)}</p>
      ${npcLink ? `<p><a href="${npcLink}" target="_blank" rel="noopener">${esc(r[9])} on Wowhead</a></p>` : ""}
      ${z ? `<p>${z.cat === 2 ? "Dungeon" : z.cat === 3 ? "Raid" : "Zone"}: <button class="linkish" data-loot="zone" data-z="${z.id}">all loot from ${esc(z.name)}</button>${z.inst === 0 ? ` · <a href="#map">see the map</a>` : ""}</p>` : ""}
    </details>
    <details class="dd"><summary>Full stats</summary>
      <p><a class="wh q${r[2]}" href="https://www.wowhead.com/forever/item=${r[0]}" target="_blank" rel="noopener">${esc(r[1])}</a></p>
      <p class="muted dd-note">Hover for the full tooltip (stats, effects, set bonuses), or open it on Wowhead for comments and screenshots.</p>
    </details>
    <div class="sheet-actions"><button class="btn primary" data-loot="ask">Ask the guild for this</button></div>`;
  try { if (window.$WowheadPower && window.$WowheadPower.refreshLinks) window.$WowheadPower.refreshLinks(); } catch {}
}

document.addEventListener("click", (e) => {
  const view = $("#view-loot"); if (!view || view.hidden) return;
  const s = e.target.closest(".sorth");
  if (s) { st.dir = st.sort === s.dataset.sort ? -st.dir : (s.dataset.sort === "name" ? 1 : -1); st.sort = s.dataset.sort; draw(); return; }
  const b = e.target.closest("[data-loot]");
  if (b) {
    const a = b.dataset.loot;
    if (a === "more") { st.limit += 200; draw(); }
    else if (a === "close") { st.sel = null; sheet(); draw(); }
    else if (a === "reset") { Object.assign(st, { q: "", quality: "", slot: "", type: "", source: "", zone: "", minLv: "", maxLv: "", onlyNew: false, limit: 100 }); view.dataset.built = ""; render(); }
    else if (a === "zone") { st.zone = b.dataset.z; st.limit = 100; const zs = $("#lf-zone"); if (zs) zs.value = st.zone; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (a === "ask") { const r = ITEMS.find((x) => x[0] === st.sel); if (r && window.GC_POST) window.GC_POST(r[1], "item"); }
    return;
  }
  const row = e.target.closest("tr[data-item]");
  if (row && !e.target.closest("a")) { st.sel = Number(row.dataset.item); draw(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches && e.target.matches("#view-loot tr[data-item]")) { st.sel = Number(e.target.dataset.item); draw(); } });

window.GC_LOOT = { render };
const lv = document.getElementById("view-loot");
if (lv && !lv.hidden && !lv.dataset.built) render();
})();
