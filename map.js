/* Bark and Stone — World map: where herbs, ore and chests are found (data: map.json, from Wowhead's WoW Forever database).
   The continent layout is our own schematic (not to scale, not Blizzard's artwork). Grids use in-game map coordinates (0–100). */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Schematic positions: [zoneId, centreX, centreY, width, height] in a 100 x 118 box per continent. Small tiles are cities.
const LAYOUT = {
  "Eastern Kingdoms": [
    [1497, 10, 4, 12, 6], [85, 24, 9, 22, 9], [28, 46, 9, 20, 9], [139, 68, 9, 22, 9],
    [130, 20, 21, 20, 9], [36, 42, 20, 18, 8], [47, 64, 21, 22, 9],
    [17065, 12, 33, 16, 8], [267, 34, 31, 20, 8], [45, 56, 33, 20, 9],
    [11, 48, 45, 20, 9],
    [1, 32, 56, 20, 9], [1537, 46, 55, 10, 6], [38, 60, 55, 16, 9],
    [51, 40, 66, 18, 8], [3, 60, 66, 18, 8],
    [46, 44, 76, 20, 8], [44, 64, 78, 16, 8],
    [1519, 22, 84, 12, 6], [12, 40, 86, 18, 8], [8, 70, 89, 18, 8],
    [40, 24, 95, 18, 8], [10, 42, 96, 16, 8], [41, 58, 98, 14, 8], [4, 72, 101, 16, 8],
    [33, 40, 110, 26, 9],
  ],
  Kalimdor: [
    [1657, 18, 6, 12, 6], [141, 30, 9, 16, 8], [493, 50, 9, 14, 7], [618, 70, 10, 22, 9],
    [148, 32, 21, 16, 10], [361, 52, 21, 16, 9], [616, 70, 23, 16, 8], [16, 86, 32, 18, 9],
    [331, 48, 34, 22, 9], [406, 24, 42, 22, 8], [1637, 74, 38, 14, 6],
    [405, 20, 56, 20, 9], [17, 52, 52, 22, 16], [14, 76, 50, 16, 10],
    [1638, 32, 64, 14, 6], [215, 36, 73, 18, 8], [15, 74, 70, 20, 9],
    [357, 18, 84, 20, 9], [400, 52, 82, 22, 8],
    [1377, 24, 103, 18, 9], [490, 46, 100, 18, 9], [440, 70, 104, 20, 10],
  ],
};
const PLACED = new Set(Object.values(LAYOUT).flat().map((z) => z[0]));
const TERR = { 0: "Alliance", 1: "Horde", 2: "Contested", 3: "Sanctuary", 4: "PvP" };
const KIND = { herb: "Herb", vein: "Ore", chest: "Chest" };

let M = null, ZONES = new Map(), NODES = [], loading = null;
const ALIAS = new Map();
const st = { q: "", kind: "all", node: null, zone: null };

function load() {
  if (loading) return loading;
  loading = fetch("map.json?v=1").then((r) => r.json()).then((d) => {
    M = d;
    d.zones.forEach(([id, name, cat, min, max, terr, inst, isNew]) => {
      if (!ZONES.has(id)) ZONES.set(id, { id, name, cat, min, max, terr, inst, isNew: !!isNew });
    });
    // Forever has second copies of some zones (e.g. a redone Elwynn Forest). Fold them into the tile of the same name.
    const placedByName = {};
    PLACED.forEach((id) => { const z = ZONES.get(id); if (z) placedByName[z.name] = id; });
    ZONES.forEach((z) => { if (!PLACED.has(z.id) && placedByName[z.name] && z.inst === 0) ALIAS.set(z.id, placedByName[z.name]); });
    NODES = d.nodes.filter((n) => Object.keys(n.zones).length).map((n) => {
      const zones = {};
      for (const [id, v] of Object.entries(n.zones)) {
        const to = ALIAS.get(Number(id)) || Number(id);
        if (!zones[to]) zones[to] = { n: 0, c: [] };
        zones[to].n += v.n; zones[to].c = zones[to].c.concat(v.c);
      }
      return { ...n, zones };
    });
  });
  return loading;
}

const zoneName = (id) => (ZONES.get(Number(id)) || { name: "Unknown area #" + id }).name;
const levels = (z) => (z && z.max ? `${z.min}–${z.max}` : "");

// Group same-named nodes (Wowhead lists some herbs/veins more than once) for searching.
function groups() {
  const g = new Map();
  for (const n of NODES) {
    const key = n.kind + "|" + n.name;
    if (!g.has(key)) g.set(key, { key, kind: n.kind, name: n.name, skill: n.skill, isNew: n.isNew, ids: [], zones: {} });
    const e = g.get(key); e.ids.push(n.id); e.skill = Math.min(e.skill || 999, n.skill || 0) || n.skill;
    for (const [z, v] of Object.entries(n.zones)) {
      const t = e.zones[z] || (e.zones[z] = { n: 0, c: new Map() });
      t.n += v.n;
      for (const [x, y, k] of v.c) t.c.set(x + "," + y, (t.c.get(x + "," + y) || 0) + k);
    }
  }
  return [...g.values()];
}
let GROUPS = null;

// Link a node to the crafting item it gives (Peacebloom -> Peacebloom, Copper Vein -> Copper Ore).
function itemFor(name) {
  const items = window.GC_ITEMS ? window.GC_ITEMS() : null; if (!items) return null;
  const base = name.replace(/^(Ooze Covered|Small|Rich|Poor|Hakkari|Heavy|Lesser|Stunted|Wilted)\s+/i, "");
  const cands = [name, base, base.replace(/\s+(Mineral\s+)?(Vein|Deposit|Formation)$/i, " Ore"), base.replace(/\s+(Mineral\s+)?(Vein|Deposit|Formation)$/i, "")];
  for (const c of cands) { const hit = items.byName[c.toLowerCase()]; if (hit) return hit; }
  return null;
}

function heatColor(t) { return `color-mix(in oklab, var(--heat) ${Math.round(18 + t * 82)}%, transparent)`; }

function continentSvg(title, focus) {
  const tiles = LAYOUT[title].map(([id, cx, cy, w, h]) => {
    const z = ZONES.get(id); if (!z) return "";
    const city = w <= 14 && h <= 6;
    const f = focus ? focus[id] : null;
    const cls = ["z", "t" + z.terr, city ? "city" : "", st.zone === id ? "sel" : "", focus ? (f ? "hit" : "dim") : ""].join(" ");
    const heat = f ? `style="--h:${heatColor(f.t)}"` : "";
    const lv = levels(z);
    return `<g class="${cls}" data-zone="${id}" ${heat} tabindex="0" role="button" aria-label="${esc(z.name)}${lv ? ", levels " + lv : ""}${f ? ", " + f.n + " nodes" : ""}">
      <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="1.6"></rect>
      <text x="${cx}" y="${cy - (city ? 0 : 0.6)}" class="zn">${esc(z.name.length > 18 && !city ? z.name.replace("Mountains", "Mtns").replace("Plaguelands", "Plague.") : z.name)}</text>
      ${city ? "" : `<text x="${cx}" y="${cy + 2.6}" class="zl">${f ? f.n + " nodes" : lv}</text>`}
    </g>`;
  }).join("");
  return `<figure class="continent"><figcaption>${esc(title)}</figcaption>
    <svg viewBox="0 0 100 118" role="group" aria-label="${esc(title)} schematic map">${tiles}</svg></figure>`;
}

function render() {
  const root = $("#view-map"); if (!root) return;
  if (!M) {
    root.innerHTML = `<div class="empty"><strong>Loading the map…</strong></div>`;
    load().then(render).catch(() => { root.innerHTML = `<div class="empty"><strong>The map didn't load.</strong>Refresh the page to try again.</div>`; });
    return;
  }
  if (!GROUPS) GROUPS = groups();
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="map-head">
        <div><p class="eyebrow">Bark and Stone · World map</p><h2 class="hero-title">Where to find it</h2>
        <p class="muted map-intro">Herbs, ore and treasure chests across Azeroth in WoW Forever. Search for something to light up the zones it's in, or click a zone to see what's there. Coordinates match the in-game map.</p></div>
      </div>
      <div class="filters">
        <input type="search" id="mapq" placeholder="Search herbs, ore or chests (e.g. Peacebloom, Mithril)" aria-label="Search herbs, ore or chests">
        <div class="chips" id="mapkinds"></div>
      </div>
      <div class="map-layout">
        <div><div class="map-results" id="mapresults"></div><div class="map-board" id="mapboard"></div>
          <p class="map-legend"><span class="lg t0"></span>Alliance <span class="lg t1"></span>Horde <span class="lg t2"></span>Contested · Schematic layout, not to scale.</p>
          <div id="maprest"></div></div>
        <aside class="sheet map-sheet" id="mapsheet" aria-label="Details"></aside>
      </div>`;
    $("#mapq").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
  }
  draw();
}

function draw() {
  const kinds = [["all", "All"], ["herb", "Herbs"], ["vein", "Ore"], ["chest", "Chests"]];
  $("#mapkinds").innerHTML = kinds.map(([k, l]) => `<button class="chip" data-mapkind="${k}" aria-pressed="${st.kind === k}">${l}</button>`).join("");

  const q = st.q.trim().toLowerCase();
  const list = GROUPS.filter((g) => (st.kind === "all" || g.kind === st.kind) && (!q || g.name.toLowerCase().includes(q)))
    .sort((a, b) => (a.skill || 0) - (b.skill || 0) || a.name.localeCompare(b.name));
  const sel = st.node && GROUPS.find((g) => g.key === st.node);
  $("#mapresults").innerHTML = (q || st.kind !== "all" || sel)
    ? `<div class="chips map-picks">${list.slice(0, 40).map((g) => `<button class="chip" data-node="${esc(g.key)}" aria-pressed="${st.node === g.key}">${esc(g.name)}${g.skill > 1 ? `<span class="n">${g.skill}</span>` : ""}</button>`).join("") || '<span class="muted">Nothing matches that search.</span>'}</div>`
    : `<p class="muted map-tip">Try a herb like <button class="linkish" data-pick="herb|Peacebloom">Peacebloom</button>, ore like <button class="linkish" data-pick="vein|Mithril Deposit">Mithril</button>, or click any zone.</p>`;

  let focus = null;
  if (sel) {
    const max = Math.max(...Object.values(sel.zones).map((z) => z.n), 1);
    focus = {}; for (const [z, v] of Object.entries(sel.zones)) focus[z] = { n: v.n, t: v.n / max };
  }
  $("#mapboard").innerHTML = continentSvg("Eastern Kingdoms", focus) + continentSvg("Kalimdor", focus);

  // Zones with no spot on the schematic (new Forever zones, dungeons, raids) are listed instead.
  const restIds = sel ? Object.keys(sel.zones).map(Number).filter((z) => !PLACED.has(z))
    : [...ZONES.values()].filter((z) => !PLACED.has(z.id) && !ALIAS.has(z.id) && z.inst === 0 && [0, 1, -1].includes(z.cat) && z.max > 0).map((z) => z.id);
  $("#maprest").innerHTML = restIds.length ? `<h3>${sel ? "Also found in" : "Other zones"}</h3><div class="chips">${restIds.map((id) => {
    const z = ZONES.get(id); const n = sel ? sel.zones[id].n : 0;
    return `<button class="chip" data-zone="${id}" aria-pressed="${st.zone === id}">${esc(zoneName(id))}${z && z.isNew ? ' <span class="tag new">New</span>' : ""}<span class="n">${sel ? n : levels(z)}</span></button>`;
  }).join("")}</div>` : "";
  sheet(sel);
}

function grid(cells) {
  const max = Math.max(...[...cells.values()], 1);
  const rects = [...cells.entries()].map(([k, v]) => { const [x, y] = k.split(",").map(Number); return `<rect x="${x * 5}" y="${y * 5}" width="5" height="5" style="fill:${heatColor(v / max)}"><title>${x * 5}–${x * 5 + 5}, ${y * 5}–${y * 5 + 5}: ${v}</title></rect>`; }).join("");
  const ticks = [0, 25, 50, 75, 100].map((t) => `<line x1="${t}" y1="0" x2="${t}" y2="100" class="gl"/><line x1="0" y1="${t}" x2="100" y2="${t}" class="gl"/><text x="${t}" y="106" class="gt">${t}</text><text x="-6" y="${t + 1.5}" class="gt">${t}</text>`).join("");
  const top = [...cells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => { const [x, y] = k.split(",").map(Number); return `${x * 5 + 2.5}, ${y * 5 + 2.5}`; });
  return `<svg class="heat" viewBox="-9 -3 112 113" role="img" aria-label="Spawn density by map coordinates">${ticks}${rects}</svg>
    <p class="muted" style="font-size:.84rem;margin:6px 0 0">Busiest spots: ${top.map((t) => `<strong class="num">${t}</strong>`).join(" · ")}</p>`;
}

function sheet(sel) {
  const el = $("#mapsheet");
  const z = st.zone && ZONES.get(st.zone);
  el.dataset.empty = (!sel && !z) ? "true" : "false";
  if (!sel && !z) { el.innerHTML = `<div class="empty"><strong>Pick something to find</strong>Search above, or click a zone to see its herbs, ore and chests.</div>`; return; }

  if (sel && (!z || !sel.zones[st.zone])) {
    const item = itemFor(sel.name);
    const rows = Object.entries(sel.zones).sort((a, b) => b[1].n - a[1].n);
    el.innerHTML = `<div class="head"><div><h2>${esc(sel.name)}</h2><div class="sub">${KIND[sel.kind]}${sel.skill > 1 ? " · skill " + sel.skill : ""}${sel.isNew ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
      <button class="btn small close" data-act="map-close">Close</button></div>
      ${item ? `<p class="muted" style="margin:10px 0 0">Gives <button class="linkish" data-recipes="${esc(item.name)}">${esc(item.name)}</button>, used in ${item.uses} recipe${item.uses === 1 ? "" : "s"}.</p>` : ""}
      <h3>Found in ${rows.length} zone${rows.length === 1 ? "" : "s"}</h3>
      <ul class="mats">${rows.map(([id, v]) => `<li><button class="linkish" data-zone="${id}">${esc(zoneName(id))}</button><span class="num muted">${v.n} spawn${v.n === 1 ? "" : "s"}</span></li>`).join("")}</ul>
      <p class="muted" style="font-size:.84rem;margin:12px 0 0">Pick a zone to see where in it.</p>
      <p style="margin:10px 0 0"><a href="https://www.wowhead.com/forever/object=${sel.ids[0]}#map" target="_blank" rel="noopener">Exact spots on Wowhead</a></p>`;
    return;
  }

  if (sel && z) {
    const v = sel.zones[st.zone];
    el.innerHTML = `<div class="head"><div><h2>${esc(sel.name)}</h2><div class="sub">${esc(z.name)} · ${v.n} spawn${v.n === 1 ? "" : "s"}</div></div>
      <button class="btn small close" data-act="map-close">Close</button></div>
      <h3>Where in ${esc(z.name)}</h3>${grid(v.c)}
      <p style="margin:12px 0 0"><button class="btn small" data-act="map-back">All zones for ${esc(sel.name)}</button></p>
      <p style="margin:10px 0 0"><a href="https://www.wowhead.com/forever/object=${sel.ids[0]}#map" target="_blank" rel="noopener">Exact spots on Wowhead</a></p>`;
    return;
  }

  // A zone with nothing selected: everything gatherable there.
  const here = GROUPS.filter((g) => g.zones[st.zone]).sort((a, b) => a.kind.localeCompare(b.kind) || (a.skill || 0) - (b.skill || 0));
  const section = (kind, label) => {
    const rows = here.filter((g) => g.kind === kind); if (!rows.length) return "";
    return `<h3>${label}</h3><ul class="mats">${rows.map((g) => `<li><button class="linkish" data-node="${esc(g.key)}">${esc(g.name)}</button><span class="num muted">${g.skill > 1 ? "skill " + g.skill + " · " : ""}${g.zones[st.zone].n}</span></li>`).join("")}</ul>`;
  };
  el.innerHTML = `<div class="head"><div><h2>${esc(z.name)}</h2><div class="sub">${levels(z) ? "Levels " + levels(z) + " · " : ""}${TERR[z.terr] || ""}${z.isNew ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
    <button class="btn small close" data-act="map-close">Close</button></div>
    ${here.length ? section("herb", "Herbs") + section("vein", "Ore") + section("chest", "Chests") : `<p class="muted">No herbs, ore or chests are recorded here.</p>`}
    <p style="margin:14px 0 0"><a href="https://www.wowhead.com/forever/zone=${z.id}" target="_blank" rel="noopener">${esc(z.name)} on Wowhead</a></p>`;
}

document.addEventListener("click", (e) => {
  if (!$("#view-map") || $("#view-map").hidden) return;
  const t = e.target.closest("[data-zone],[data-node],[data-mapkind],[data-pick],[data-recipes],[data-act^='map-']");
  if (!t) return;
  if (t.dataset.mapkind) { st.kind = t.dataset.mapkind; draw(); }
  else if (t.dataset.pick) { st.node = t.dataset.pick; st.zone = null; draw(); }
  else if (t.dataset.node) { st.node = st.node === t.dataset.node && !st.zone ? null : t.dataset.node; st.zone = null; draw(); }
  else if (t.dataset.zone) { st.zone = Number(t.dataset.zone); draw(); }
  else if (t.dataset.recipes) { window.GC_SEARCH_RECIPES && window.GC_SEARCH_RECIPES(t.dataset.recipes); }
  else if (t.dataset.act === "map-close") { st.zone = null; st.node = null; draw(); }
  else if (t.dataset.act === "map-back") { st.zone = null; draw(); }
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#view-map g[data-zone]")) { e.preventDefault(); st.zone = Number(e.target.dataset.zone); draw(); }
});

window.GC_MAP = { render };
})();
