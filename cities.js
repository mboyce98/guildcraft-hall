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
  if (/Weapon Master|Pet Trainer|Demon Trainer/i.test(t)) return "class";
  if (/Banker|Auctioneer|Innkeeper|Gryphon|Flight Master|Wind Rider|Hippogryph|Bat Handler|Stable Master|Battlemaster|Guild Master|Tabard|Mailbox/i.test(t)) return "service";
  return "vendor";
}

let DATA = null, loading = null;
const st = { city: "ironforge", cats: new Set(["class", "prof", "vendor", "service"]), q: "", sel: null };

function load() {
  if (!loading) loading = fetch("city-npcs.json?v=3").then((r) => r.json()).then((d) => {
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
  $("#city-list").innerHTML = groups || `<div class="empty"><strong>Nothing to show.</strong>${city.npcs.length ? "Try another search or turn a category back on." : "This city's markers are still being added."}</div>`;
  popup();
}

// Gold / silver / copper, like the in-game money display.
function coins(copper) {
  copper = Number(copper) || 0;
  if (!copper) return '<span class="muted">free</span>';
  const g = Math.floor(copper / 10000), s = Math.floor((copper % 10000) / 100), c = copper % 100;
  return `<span class="coins">${g ? `<span class="g">${g}</span>` : ""}${s ? `<span class="s">${s}</span>` : ""}${c ? `<span class="c">${c}</span>` : ""}</span>`;
}

// Pop-up for the clicked NPC: what they sell (with prices) or teach (with costs).
function popup() {
  let box = document.getElementById("npc-modal");
  const city = DATA.cities[st.city];
  const n = st.sel && city.npcs.find((x) => x[0] === st.sel);
  if (!n) { if (box) box.hidden = true; return; }
  if (!box) { box = document.createElement("div"); box.id = "npc-modal"; box.className = "modal npc-modal"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); document.body.appendChild(box); }
  const sells = n[6] || [], teach = n[7] || [];
  const stock = (a) => (a > 0 ? `<span class="muted">limited (${a})</span>` : "");
  const sellsTable = sells.length ? `<table class="ware"><thead><tr><th>Item</th><th>Req</th><th>Price</th></tr></thead><tbody>${sells.map((it) => `<tr>
      <td><a class="wh q${it[2]}" href="https://www.wowhead.com/forever/item=${it[0]}" target="_blank" rel="noopener">${esc(it[1])}</a> ${stock(it[4])}</td>
      <td class="num muted">${it[5] || ""}</td><td class="num">${coins(it[3])}</td></tr>`).join("")}</tbody></table>` : "";
  const teachTable = teach.length ? `<table class="ware"><thead><tr><th>Teaches</th><th>Level</th><th>Cost</th></tr></thead><tbody>${teach.map((sp) => `<tr>
      <td><a class="wh" href="https://www.wowhead.com/forever/spell=${sp[0]}" target="_blank" rel="noopener">${esc(sp[1])}</a> <span class="muted">${esc(sp[2])}</span></td>
      <td class="num muted">${sp[3] || ""}</td><td class="num">${coins(sp[4])}</td></tr>`).join("")}</tbody></table>` : "";
  const none = n[6] === undefined
    ? `<p class="muted">Their wares and prices are still being added. <a href="https://www.wowhead.com/forever/npc=${n[0]}" target="_blank" rel="noopener">See ${esc(n[1])} on Wowhead</a>.</p>`
    : `<p class="muted">${n.cat === "service" ? "Offers a service rather than goods." : "Nothing listed for sale or training."}</p>`;
  box.innerHTML = `<div class="card npc-card">
    <div class="head"><div><h2>${esc(n[1])}</h2><div class="sub">${esc(n[2])} · ${esc(city.name)} ${n[3]}, ${n[4]}${n[5] ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
      <button class="btn small" data-npc-close aria-label="Close">Close</button></div>
    ${sellsTable || teachTable ? `<div class="ware-wrap">${sellsTable}${teachTable}</div>` : none}
    <p class="muted ware-note">Prices are the base cost before reputation discounts. Hover an item for its Wowhead details.</p>
    <p><a href="https://www.wowhead.com/forever/npc=${n[0]}" target="_blank" rel="noopener">${esc(n[1])} on Wowhead</a></p>
  </div>`;
  box.hidden = false;
  try { if (window.$WowheadPower && window.$WowheadPower.refreshLinks) window.$WowheadPower.refreshLinks(); } catch {}
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.sel && $("#view-cities") && !$("#view-cities").hidden) { st.sel = null; draw(); } });
document.addEventListener("click", (e) => {
  const v = $("#view-cities"); if (!v || v.hidden) return;
  if (e.target.closest("[data-npc-close]") || e.target.id === "npc-modal") { st.sel = null; draw(); return; }
  if (e.target.closest("#npc-modal")) return;
  const c = e.target.closest("[data-city]"); if (c) { st.city = c.dataset.city; st.sel = null; draw(); return; }
  const k = e.target.closest("[data-cat]"); if (k) { const x = k.dataset.cat; st.cats.has(x) ? st.cats.delete(x) : st.cats.add(x); if (!st.cats.size) CATS.forEach(([y]) => st.cats.add(y)); draw(); return; }
  const n = e.target.closest("[data-npc]");
  if (n) { const id = Number(n.dataset.npc); st.sel = st.sel === id ? null : id; draw(); if (n.classList.contains("npc-row")) { const p = document.querySelector(`.pin[data-npc="${id}"]`); if (p) p.scrollIntoView({ block: "nearest", inline: "nearest" }); } }
});

window.GC_CITIES = { render };
const cv = document.getElementById("view-cities");
if (cv && !cv.hidden && !cv.dataset.built) render();
})();
