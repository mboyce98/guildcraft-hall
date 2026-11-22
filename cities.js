/* Bark and Stone — City guide: trainers, vendors and services marked on the city maps.
   Positions are in-game map coordinates (0–100) from Wowhead's WoW Forever data (city-npcs.json).
   NPC row: [id, name, tag, x, y, isNew] */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Map image frames: the real map is 1002 x 668; Stormwind's file is padded to 1024 x 768.
const FRAME = { ironforge: { w: 1002, h: 668, fw: 1002, fh: 668 }, stormwind: { w: 1024, h: 768, fw: 1002, fh: 668 } };
const CLASSES = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];
const PROFS = ["Alchemy", "Blacksmith", "Enchant", "Engineer", "Herbalis", "Leatherwork", "Mining", "Skinning", "Tailor", "Cooking", "First Aid", "Fishing", "Riding"];
const CATS = [
  ["class", "Class & weapon trainers"], ["prof", "Profession trainers"], ["vendor", "Vendors"], ["service", "Bank, travel & services"],
];

function category(tag) {
  const t = tag || "";
  if (/Trainer/i.test(t) && CLASSES.some((c) => t.startsWith(c))) return "class";
  if (/Trainer|^(Artisan|Expert|Journeyman|Master) /i.test(t) && PROFS.some((p) => t.includes(p)) && !/Supplies|Supplier|Recipes/i.test(t)) return "prof";
  if (/Weapon Master|Pet Trainer/i.test(t)) return "class";
  if (/Banker|Auctioneer|Innkeeper|Gryphon|Flight Master|Wind Rider|Hippogryph|Bat Handler|Stable Master|Battlemaster|Guild Master|Tabard|Mailbox/i.test(t)) return "service";
  return "vendor";
}

let DATA = null, loading = null;
const st = { city: "ironforge", cats: new Set(["class", "prof", "vendor", "service"]), q: "", sel: null };

function load() {
  if (!loading) loading = fetch("city-npcs.json?v=1").then((r) => r.json()).then((d) => {
    DATA = d;
    for (const c of Object.values(d.cities)) c.npcs.forEach((n) => { n.cat = category(n[2]); n.s = (n[1] + " " + n[2]).toLowerCase(); });
  });
  return loading;
}

function render() {
  const root = $("#view-cities"); if (!root) return;
  if (!DATA) { root.innerHTML = `<div class="empty"><strong>Unrolling the city maps…</strong></div>`; load().then(render); return; }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="page-head"><p class="eyebrow">Bark and Stone · City guide</p><h2 class="hero-title">Capital cities</h2>
        <p class="muted page-intro">Where to find every trainer, vendor, bank and flight master. Hover a marker for who it is, or search the list. Positions match the in-game map coordinates.</p></div>
      <div class="filters">
        <div class="chips" id="city-pick"></div>
        <input type="search" id="cq" placeholder="Search (e.g. Mage, Mining, Banker, Gryphon)" aria-label="Search trainers and vendors">
      </div>
      <div class="chips cat-chips" id="city-cats"></div>
      <div class="city-layout">
        <div><div class="city-map" id="city-map"></div><p class="muted city-note" id="city-note"></p></div>
        <aside class="sheet city-list" id="city-list" aria-label="Trainers and vendors"></aside>
      </div>`;
    $("#cq").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
  }
  draw();
}

function draw() {
  const city = DATA.cities[st.city];
  $("#city-pick").innerHTML = Object.entries(DATA.cities).map(([k, c]) => `<button class="chip" data-city="${k}" aria-pressed="${st.city === k}">${esc(c.name)}</button>`).join("");
  $("#city-cats").innerHTML = CATS.map(([k, l]) => `<button class="chip cat-${k}" data-cat="${k}" aria-pressed="${st.cats.has(k)}"><span class="cdot2"></span>${l}<span class="n">${city.npcs.filter((n) => n.cat === k).length}</span></button>`).join("");
  const q = st.q.trim().toLowerCase();
  const list = city.npcs.filter((n) => st.cats.has(n.cat) && (!q || n.s.includes(q)) && n[3] != null);
  const f = FRAME[st.city];
  const marks = list.map((n) => `<button class="pin cat-${n.cat} ${st.sel === n[0] ? "sel" : ""} ${n[4] < 18 ? "tip-below" : ""} ${n[3] < 15 ? "tip-right" : n[3] > 85 ? "tip-left" : ""}" style="left:${n[3]}%;top:${n[4]}%" data-npc="${n[0]}" aria-label="${esc(n[1])}, ${esc(n[2])}"><span class="pin-tip"><strong>${esc(n[1])}</strong>${esc(n[2])}<em>${n[3]}, ${n[4]}</em></span></button>`).join("");
  $("#city-map").innerHTML = `<div class="city-frame" style="aspect-ratio:${f.fw}/${f.fh}">
      <img src="${esc(city.image)}?v=1" alt="Map of ${esc(city.name)}" style="width:${(f.w / f.fw) * 100}%" width="${f.w}" height="${f.h}">
      <div class="pins">${marks}</div></div>`;
  $("#city-note").textContent = city.npcs.length
    ? `${list.length} shown of ${city.npcs.length} marked.${city.complete ? "" : " More are still being added."}`
    : "Positions for this city are still being added.";

  // The list beside the map, grouped by category.
  const groups = CATS.filter(([k]) => st.cats.has(k)).map(([k, l]) => {
    const rows = list.filter((n) => n.cat === k).sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
    if (!rows.length) return "";
    return `<details class="dd" open><summary><span class="cdot2 cat-${k}"></span>${l} <span class="muted num">${rows.length}</span></summary>
      <ul class="npc-list">${rows.map((n) => `<li><button class="npc-row ${st.sel === n[0] ? "sel" : ""}" data-npc="${n[0]}"><span><strong>${esc(n[2])}</strong>${esc(n[1])}${n[5] ? ' <span class="tag new">New</span>' : ""}</span><span class="num muted">${n[3]}, ${n[4]}</span></button></li>`).join("")}</ul></details>`;
  }).join("");
  const sel = st.sel && city.npcs.find((n) => n[0] === st.sel);
  $("#city-list").innerHTML = (sel ? `<div class="npc-pick"><h2>${esc(sel[1])}</h2><div class="sub">${esc(sel[2])} · ${sel[3]}, ${sel[4]}</div>
      <p><a href="https://www.wowhead.com/forever/npc=${sel[0]}" target="_blank" rel="noopener">${esc(sel[1])} on Wowhead</a> <span class="muted">(what they sell or teach)</span></p></div>` : "")
    + (groups || `<div class="empty"><strong>Nothing to show.</strong>${city.npcs.length ? "Try another search or turn a category back on." : "This city's markers are still being added."}</div>`);
}

document.addEventListener("click", (e) => {
  const v = $("#view-cities"); if (!v || v.hidden) return;
  const c = e.target.closest("[data-city]"); if (c) { st.city = c.dataset.city; st.sel = null; draw(); return; }
  const k = e.target.closest("[data-cat]"); if (k) { const x = k.dataset.cat; st.cats.has(x) ? st.cats.delete(x) : st.cats.add(x); if (!st.cats.size) CATS.forEach(([y]) => st.cats.add(y)); draw(); return; }
  const n = e.target.closest("[data-npc]");
  if (n) { const id = Number(n.dataset.npc); st.sel = st.sel === id ? null : id; draw(); if (n.classList.contains("npc-row")) { const p = document.querySelector(`.pin[data-npc="${id}"]`); if (p) p.scrollIntoView({ block: "nearest", inline: "nearest" }); } }
});

window.GC_CITIES = { render };
const cv = document.getElementById("view-cities");
if (cv && !cv.hidden && !cv.dataset.built) render();
})();
