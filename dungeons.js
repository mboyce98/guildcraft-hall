/* Bark and Stone — Dungeons: every WoW Forever dungeon with its level range, entrance, bosses and in-game map.
   Data: dungeons.json (from Wowhead's WoW Forever Dungeon Journal). Maps are the in-game maps Wowhead hosts.
   Boss row: [name, npcId] */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BANDS = [["", "All levels"], ["13-25", "13–25"], ["25-40", "25–40"], ["40-52", "40–52"], ["52-60", "52–60"], ["new", "✦ New in Forever"]];

let DATA = null, loading = null;
const st = { band: "", q: "", sel: null, big: false };

function load() {
  if (!loading) loading = fetch("dungeons.json?v=1").then((r) => r.json()).then((d) => { DATA = d; });
  return loading;
}

const fits = (d) => {
  if (st.band === "new") return !!d.new;
  if (!st.band) return true;
  const [lo, hi] = st.band.split("-").map(Number);
  return d.lv[0] <= hi && d.lv[1] >= lo;
};

function render() {
  const root = $("#view-dungeons"); if (!root) return;
  if (!DATA) { root.innerHTML = `<div class="empty"><strong>Lighting the torches…</strong></div>`; load().then(render).catch(() => { root.innerHTML = `<div class="empty"><strong>Couldn't load the dungeon list.</strong> Try again in a moment.</div>`; }); return; }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="page-head"><p class="eyebrow">Bark and Stone · World</p><h2 class="hero-title">Dungeons</h2>
        <p class="muted page-intro">Every dungeon in WoW Forever: who it's for, where the entrance is, the bosses inside and the in-game map. Pick one from the list.</p></div>
      <div class="filters">
        <div class="chips" id="dg-bands"></div>
        <input type="search" id="dgq" placeholder="Search a dungeon or boss (e.g. VanCleef)" aria-label="Search dungeons and bosses">
      </div>
      <div class="dg-layout">
        <aside class="sheet dg-list" id="dg-list" aria-label="Dungeons"></aside>
        <div id="dg-detail"></div>
      </div>`;
    $("#dgq").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dg-band]"); if (b) { st.band = b.dataset.dgBand; draw(); return; }
      const p = e.target.closest("[data-dg]"); if (p) { st.sel = p.dataset.dg; st.big = false; draw(); if (window.matchMedia("(max-width: 860px)").matches) $("#dg-detail").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (e.target.closest("[data-dg-zoom]")) { st.big = !st.big; drawDetail(); }
    });
  }
  draw();
}

function draw() {
  const q = st.q.trim().toLowerCase();
  $("#dg-bands").innerHTML = BANDS.map(([k, l]) => `<button class="chip" data-dg-band="${k}" aria-pressed="${st.band === k}">${l}</button>`).join("");
  const list = DATA.dungeons.filter((d) => fits(d) && (!q || d.n.toLowerCase().includes(q) || (d.at || "").toLowerCase().includes(q) || d.b.some((b) => b[0].toLowerCase().includes(q))));
  if (!st.sel || !list.some((d) => d.s === st.sel)) st.sel = list.length ? list[0].s : null;
  const row = (d) => `<button class="dg-item ${st.sel === d.s ? "sel" : ""}" data-dg="${d.s}" aria-pressed="${st.sel === d.s}">
      <span class="dg-lv">${d.lv[0]}–${d.lv[1]}</span><span class="dg-nm"><span>${esc(d.n)}${d.new ? ' <em class="dg-new">New</em>' : ""}</span><small>${d.at ? esc(d.at) + " · " : ""}${d.b.length} bosses</small></span></button>`;
  const fresh = list.filter((d) => d.new), classic = list.filter((d) => !d.new);
  $("#dg-list").innerHTML = list.length
    ? (fresh.length ? `<h4 class="dg-grp">New in WoW Forever</h4>${fresh.map(row).join("")}` : "") + (classic.length ? `<h4 class="dg-grp">Classic dungeons</h4>${classic.map(row).join("")}` : "")
    : `<p class="muted">No dungeon matches that.</p>`;
  drawDetail();
}

function drawDetail() {
  const d = DATA.dungeons.find((x) => x.s === st.sel), el = $("#dg-detail");
  if (!d) { el.innerHTML = ""; return; }
  const wh = `https://www.wowhead.com/forever/dungeon-journal/${d.s}`;
  const map = d.map
    ? `<figure class="dg-map ${st.big ? "big" : ""}"><button type="button" class="dg-mapbtn" data-dg-zoom aria-label="${st.big ? "Shrink" : "Enlarge"} the map of ${esc(d.n)}">
         <img src="${DATA.mapBase}${st.big ? "original" : "zoom"}/${d.map}.jpg" alt="In-game map of ${esc(d.n)}" width="${st.big ? 1024 : 772}" height="${st.big ? 683 : 515}" loading="lazy"></button>
         <figcaption class="muted small">${st.big ? "Click the map to shrink it." : "Click the map to enlarge it."} In-game map, via Wowhead.${/scarlet|dire-maul|stratholme/.test(d.s) ? " This map shows every wing of the dungeon." : ""}</figcaption></figure>`
    : `<div class="dg-nomap"><strong>No in-game map yet.</strong><p class="muted">Wowhead hasn't published the in-game map for ${esc(d.n)}. Its Dungeon Journal page has an illustrated map.</p></div>`;
  el.innerHTML = `<article class="sheet dg-card">
      <header class="dg-head"><div><h3>${esc(d.n)}${d.new ? ' <em class="dg-new">New in Forever</em>' : ""}</h3>
        <p class="muted">Levels ${d.lv[0]}–${d.lv[1]}${d.at ? ` · Entrance: ${esc(d.at)}` : ""} · ${d.b.length} bosses</p></div>
        <a class="btn small" href="${wh}" target="_blank" rel="noopener">Loot, quests &amp; strategy on Wowhead</a></header>
      ${map}
      <h4 class="sec">Bosses</h4>
      <ol class="dg-bosses">${d.b.map((b) => `<li>${b[1] ? `<a href="https://www.wowhead.com/forever/npc=${b[1]}" target="_blank" rel="noopener">${esc(b[0])}</a>` : esc(b[0])}</li>`).join("")}</ol>
      <p class="muted small">Listed in the order Wowhead's Dungeon Journal gives. “Rare” bosses don't always spawn.</p>
    </article>`;
}

window.GC_DUNGEONS = { render };
})();
