/* Bark and Stone — Quests: every zone's quests in WoW Forever, by level and faction.
   Data: quests.json (from Wowhead's WoW Forever database). Z: zone id -> {n, ids}; Q: quest id -> [name, level, reqLevel, side, isNew, type, category].
   side: 1 Alliance, 2 Horde, 3 both. type: 1 Group, 41 PvP, 62 Raid, 81 Dungeon. */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Zone facts: [minLevel, maxLevel, group]. Groups: start, ek (Eastern Kingdoms), kal (Kalimdor), new (new in Forever), city.
const ZINFO = {
  12: [1, 10, "start", "Human"], 1: [1, 10, "start", "Dwarf & Gnome"], 141: [1, 11, "start", "Night Elf"],
  14: [1, 10, "start", "Orc & Troll"], 215: [1, 10, "start", "Tauren"], 85: [1, 12, "start", "Undead"],
  40: [9, 18, "ek"], 38: [10, 18, "ek"], 130: [10, 20, "ek"], 10: [18, 30, "ek"], 44: [15, 25, "ek"], 11: [20, 30, "ek"],
  267: [20, 31, "ek"], 36: [27, 39, "ek"], 45: [30, 40, "ek"], 33: [30, 50, "ek"], 3: [36, 45, "ek"], 8: [36, 43, "ek"],
  47: [41, 56, "ek"], 51: [43, 56, "ek"], 46: [50, 59, "ek"], 4: [46, 63, "ek"], 41: [50, 60, "ek"], 28: [46, 57, "ek"], 139: [54, 59, "ek"],
  148: [11, 19, "kal"], 17: [10, 33, "kal"], 406: [15, 25, "kal"], 331: [19, 30, "kal"], 400: [25, 35, "kal"], 405: [30, 39, "kal"],
  15: [36, 45, "kal"], 440: [40, 50, "kal"], 357: [41, 60, "kal"], 16: [42, 55, "kal"], 490: [48, 55, "kal"], 361: [47, 54, "kal"],
  618: [55, 60, "kal"], 1377: [55, 59, "kal"], 493: [15, 60, "kal"],
  16591: [36, 44, "new"], 16651: [0, 0, "new"], 616: [0, 0, "new"], 17065: [0, 0, "new"], 16756: [0, 0, "new"],
  1519: [1, 60, "city"], 1537: [1, 60, "city"], 1657: [1, 60, "city"], 1637: [1, 60, "city"], 1638: [1, 60, "city"], 1497: [1, 60, "city"],
};
const GROUPS = [["start", "Starting zones"], ["ek", "Eastern Kingdoms"], ["kal", "Kalimdor"], ["new", "New in WoW Forever"], ["city", "Capital cities"]];
const TYPE = { 1: "Group", 41: "PvP", 62: "Raid", 81: "Dungeon" };
const SIDE = { 1: ["A", "Alliance"], 2: ["H", "Horde"], 3: ["", "Both"] };

let DATA = null, loading = null;
const st = { zone: null, side: "", q: "", lvl: "", onlyNew: false, band: "", sort: "level" };
try { const s = JSON.parse(localStorage.getItem("gc-quests") || "{}"); if (s.side != null) st.side = s.side; if (s.lvl) st.lvl = s.lvl; } catch {}
const keep = () => { try { localStorage.setItem("gc-quests", JSON.stringify({ side: st.side, lvl: st.lvl })); } catch {} };

function load() {
  if (!loading) loading = fetch("quests.json?v=1").then((r) => r.json()).then((d) => {
    DATA = d;
    DATA.zones = Object.entries(d.Z).map(([id, z]) => {
      const info = ZINFO[id] || [0, 0, "ek"];
      const qs = z.ids.map((i) => d.Q[i]).filter(Boolean), lv = qs.map((q) => q[1]).filter((x) => x > 0).sort((a, b) => a - b);
      // New zones have no official range; use the middle of their quest levels.
      const lo = info[0] || (lv.length ? lv[Math.floor(lv.length * 0.1)] : 0), hi = info[1] || (lv.length ? lv[Math.floor(lv.length * 0.9)] : 0);
      return { id: +id, n: z.n, ids: z.ids, lo, hi, grp: info[2], race: info[3] || "" };
    });
  });
  return loading;
}

// Classic quest colours from the gap between quest level and your level.
function hue(level) {
  const me = Number(st.lvl); if (!me || !level) return "";
  const d = level - me;
  if (d >= 5) return "q-red"; if (d >= 3) return "q-orange"; if (d >= -2) return "q-yellow";
  const grey = me <= 5 ? 0 : me <= 39 ? me - Math.floor(me / 10) - 5 : me <= 59 ? me - Math.floor(me / 5) - 1 : 50;
  return level > grey ? "q-green" : "q-grey";
}
const sideOk = (q) => !st.side || q[3] === 3 || !q[3] || String(q[3]) === st.side;
const zoneFits = (z) => {
  if (st.band) { const [lo, hi] = st.band.split("-").map(Number); if (!(z.lo <= hi && z.hi >= lo)) return false; }
  if (st.lvl) { const me = Number(st.lvl); if (me && z.lo && z.hi && !(z.lo - 3 <= me && z.hi + 2 >= me)) return false; }
  return true;
};

function render() {
  const root = $("#view-quests"); if (!root) return;
  if (!DATA) { root.innerHTML = `<div class="empty"><strong>Reading the quest boards…</strong></div>`; load().then(render).catch(() => { root.innerHTML = `<div class="empty"><strong>Couldn't load the quests.</strong> Try again in a moment.</div>`; }); return; }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="page-head"><p class="eyebrow">Bark and Stone · World</p><h2 class="hero-title">Quests</h2>
        <p class="muted page-intro">Quests for every zone in WoW Forever, from the starting areas up, sorted by level. Pick your faction and level to see where to go next: colours match the in-game quest log.</p></div>
      <div class="filters qs-filters">
        <div class="chips" id="qs-side"></div>
        <label class="qs-lvl">Your level <input type="number" id="qs-lvl" min="1" max="60" inputmode="numeric" placeholder="1–60"></label>
        <input type="search" id="qsq" placeholder="Search a quest or zone" aria-label="Search quests and zones">
      </div>
      <div class="chips" id="qs-bands"></div>
      ${(() => { const miss = Object.entries(ZINFO).filter(([id, z]) => (z[2] === "start" || z[2] === "ek" || z[2] === "kal") && !DATA.Z[id]); return miss.length ? `<p class="muted small qs-miss">Still being added: ${miss.length} zone${miss.length === 1 ? "" : "s"} (${miss.map(([id]) => ({ 12: "Elwynn Forest", 1: "Dun Morogh", 141: "Teldrassil", 14: "Durotar", 215: "Mulgore", 4: "Blasted Lands", 41: "Deadwind Pass", 46: "Burning Steppes", 139: "Eastern Plaguelands", 1377: "Silithus" }[id] || "zone " + id)).join(", ")}). Until then, their quests are on <a href="https://www.wowhead.com/forever/quests" target="_blank" rel="noopener">Wowhead</a>.</p>` : ""; })()}
      <div class="qs-layout">
        <aside class="sheet qs-zones" id="qs-zones" aria-label="Zones"></aside>
        <div id="qs-detail"></div>
      </div>`;
    $("#qs-lvl").value = st.lvl;
    $("#qs-lvl").addEventListener("input", (e) => { const v = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)); st.lvl = v ? String(v) : ""; keep(); draw(); });
    $("#qsq").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
    root.addEventListener("click", (e) => {
      const s = e.target.closest("[data-qs-side]"); if (s) { st.side = s.dataset.qsSide; keep(); draw(); return; }
      const b = e.target.closest("[data-qs-band]"); if (b) { st.band = st.band === b.dataset.qsBand ? "" : b.dataset.qsBand; draw(); return; }
      if (e.target.closest("[data-qs-new]")) { st.onlyNew = !st.onlyNew; draw(); return; }
      const so = e.target.closest("[data-qs-sort]"); if (so) { st.sort = so.dataset.qsSort; drawDetail(); return; }
      const z = e.target.closest("[data-qs-zone]"); if (z) { st.zone = +z.dataset.qsZone; draw(); if (window.matchMedia("(max-width: 860px)").matches) $("#qs-detail").scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
  }
  draw();
}

function draw() {
  const sideChip = (v, l) => `<button class="chip" data-qs-side="${v}" aria-pressed="${st.side === v}">${l}</button>`;
  $("#qs-side").innerHTML = sideChip("", "Both factions") + sideChip("1", "Alliance") + sideChip("2", "Horde");
  $("#qs-bands").innerHTML = [["1-10", "1–10"], ["10-20", "10–20"], ["20-30", "20–30"], ["30-40", "30–40"], ["40-50", "40–50"], ["50-60", "50–60"]]
    .map(([k, l]) => `<button class="chip" data-qs-band="${k}" aria-pressed="${st.band === k}">Levels ${l}</button>`).join("")
    + `<button class="chip" data-qs-new aria-pressed="${st.onlyNew}">✦ New quests only</button>`;
  const q = st.q.trim().toLowerCase();
  const count = (z) => z.ids.filter((i) => { const x = DATA.Q[i]; return x && sideOk(x) && (!st.onlyNew || x[4]); }).length;
  const zones = DATA.zones.filter((z) => zoneFits(z) && (!q || z.n.toLowerCase().includes(q) || z.ids.some((i) => DATA.Q[i] && DATA.Q[i][0].toLowerCase().includes(q))))
    .map((z) => ({ ...z, c: count(z) })).filter((z) => z.c > 0);
  if (!zones.some((z) => z.id === st.zone)) st.zone = zones.length ? zones[0].id : null;
  const row = (z) => `<button class="dg-item ${st.zone === z.id ? "sel" : ""}" data-qs-zone="${z.id}" aria-pressed="${st.zone === z.id}">
      <span class="dg-lv">${z.lo && z.hi ? `${z.lo}–${z.hi}` : "—"}</span><span class="dg-nm">${esc(z.n)}<small>${z.race ? esc(z.race) + " start · " : ""}${z.c} quests</small></span></button>`;
  $("#qs-zones").innerHTML = zones.length ? GROUPS.map(([g, label]) => {
    const list = zones.filter((z) => z.grp === g).sort((a, b) => a.lo - b.lo || a.n.localeCompare(b.n));
    return list.length ? `<h4 class="dg-grp">${label}</h4>${list.map(row).join("")}` : "";
  }).join("") : `<p class="muted">No zone matches that${st.lvl ? " for your level" : ""}.</p>`;
  drawDetail();
}

function drawDetail() {
  const el = $("#qs-detail"), z = DATA.zones.find((x) => x.id === st.zone);
  if (!z) { el.innerHTML = ""; return; }
  const q = st.q.trim().toLowerCase(), zq = z.n.toLowerCase().includes(q) ? "" : q;
  let list = z.ids.map((i) => [i, DATA.Q[i]]).filter(([, x]) => x && sideOk(x) && (!st.onlyNew || x[4]) && (!zq || x[0].toLowerCase().includes(zq)));
  list.sort(st.sort === "name" ? (a, b) => a[1][0].localeCompare(b[1][0]) : (a, b) => (a[1][1] || 99) - (b[1][1] || 99) || a[1][0].localeCompare(b[1][0]));
  const me = Number(st.lvl);
  const ready = me ? list.filter(([, x]) => (!x[2] || x[2] <= me) && x[1] && x[1] <= me + 4 && hue(x[1]) !== "q-grey").length : 0;
  el.innerHTML = `<article class="sheet dg-card">
      <header class="dg-head"><div><h3>${esc(z.n)}</h3>
        <p class="muted">${z.lo && z.hi ? `Levels ${z.lo}–${z.hi} · ` : ""}${list.length} quests${st.side ? " for the " + SIDE[st.side][1] : ""}${me ? ` · <strong>${ready}</strong> good for level ${me}` : ""}</p></div>
        <a class="btn small" href="https://www.wowhead.com/forever/zone=${z.id}#quests" target="_blank" rel="noopener">This zone on Wowhead</a></header>
      ${me ? `<p class="qs-key small"><span class="q-grey">Too low</span><span class="q-green">Easy</span><span class="q-yellow">Right level</span><span class="q-orange">Hard</span><span class="q-red">Too hard</span></p>` : `<p class="muted small">Tip: enter your level above to colour quests like the in-game quest log.</p>`}
      <div class="qs-tablewrap"><table class="qs-table">
        <thead><tr><th><button class="linkish" data-qs-sort="level">Level</button></th><th><button class="linkish" data-qs-sort="name">Quest</button></th><th>Needs</th><th>Faction</th><th>Type</th></tr></thead>
        <tbody>${list.map(([id, x]) => `<tr class="${hue(x[1])} ${me && x[2] > me ? "q-locked" : ""}">
          <td class="qs-l">${x[1] > 0 ? x[1] : "—"}</td>
          <td><a href="https://www.wowhead.com/forever/quest=${id}" target="_blank" rel="noopener">${esc(x[0])}</a>${x[4] ? ' <em class="dg-new">New</em>' : ""}</td>
          <td>${x[2] ? x[2] : ""}</td>
          <td>${x[3] === 1 ? '<span class="tag ally">Alliance</span>' : x[3] === 2 ? '<span class="tag horde">Horde</span>' : '<span class="muted small">Both</span>'}</td>
          <td class="small">${TYPE[x[5]] || ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">“Needs” is the level you must be to pick the quest up. Quest names link to Wowhead for where to start it and what it rewards.</p>
    </article>`;
}

window.GC_QUESTS = { render };
})();
