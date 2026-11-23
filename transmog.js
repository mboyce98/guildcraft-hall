/* Bark and Stone — Transmog wardrobe (#transmog).
   Plan an outfit slot by slot from every piece of gear in WoW Forever (loot-items.json, the Loot Vault's data),
   laid out like the in-game character sheet, then save it and share it with the guild (Supabase transmog_outfits).
   Item icons and names come from Wowhead's tooltip service; "View in 3D" opens the item on Wowhead. */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = document.getElementById("view-transmog"); if (!root) return;
const ctx = () => window.GC_APP || {};

const CLASSES = { Warrior: "Plate", Paladin: "Plate", Hunter: "Mail", Shaman: "Mail", Rogue: "Leather", Druid: "Leather", Priest: "Cloth", Mage: "Cloth", Warlock: "Cloth" };
const CLASS_COLOR = { Warrior: "#C69B6D", Paladin: "#F48CBA", Hunter: "#AAD372", Rogue: "#FFF468", Priest: "#E8E8E8", Shaman: "#2E8CE8", Mage: "#3FC7EB", Warlock: "#8788EE", Druid: "#FF7C0A" };
const ARMORS = ["Cloth", "Leather", "Mail", "Plate"];
const ARMOR_ID = { Cloth: 1, Leather: 2, Mail: 3, Plate: 4 };
const ARMOR_LEVELS = { Cloth: ["Cloth"], Leather: ["Cloth", "Leather"], Mail: ["Leather", "Mail"], Plate: ["Mail", "Plate"] };
// [key, label, loot slot codes, kind]
const SLOTS = [
  ["head", "Head", [1], "armor"], ["shoulder", "Shoulders", [3], "armor"], ["back", "Back", [16], "back"], ["chest", "Chest", [5, 20], "armor"], ["wrist", "Wrists", [9], "armor"],
  ["hands", "Hands", [10], "armor"], ["waist", "Waist", [6], "armor"], ["legs", "Legs", [7], "armor"], ["feet", "Feet", [8], "armor"],
  ["main", "Main hand", [13, 21, 17], "weapon"], ["off", "Off hand", [14, 22, 23], "weapon"], ["ranged", "Ranged", [15, 25, 26], "weapon"],
];
const LEFT = ["head", "shoulder", "back", "chest", "wrist"], RIGHT = ["hands", "waist", "legs", "feet"], BOTTOM = ["main", "off", "ranged"];
const SLOT_BY = Object.fromEntries(SLOTS.map((s) => [s[0], s]));
const EMPTY_ICON = { head: "inv_helmet_03", shoulder: "inv_shoulder_02", back: "inv_misc_cape_02", chest: "inv_chest_cloth_17", wrist: "inv_bracer_07", hands: "inv_gauntlets_04",
  waist: "inv_belt_03", legs: "inv_pants_02", feet: "inv_boots_05", main: "inv_sword_04", off: "inv_shield_04", ranged: "inv_weapon_bow_05" };
const SOURCE = { 1: "Crafted", 2: "Drop", 3: "PvP", 4: "Quest", 5: "Vendor", 14: "Black Market", 16: "Fishing" };
const QNAME = { 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };
const iconUrl = (icon, size) => `https://wow.zamimg.com/images/wow/icons/${size || "large"}/${icon}.jpg`;
const whItem = (id) => `https://www.wowhead.com/forever/item=${id}`;

// ---- State ----
const blank = () => ({ id: null, name: "", cls: "", armor: "", items: {}, note: "" });
const st = { tab: "wardrobe", draft: blank(), pick: null, q: "", outfits: [], loaded: false, msg: "", runQ: "", runCls: "" };
try { const d = JSON.parse(localStorage.getItem("gc.tm.draft") || "null"); if (d && d.items) st.draft = { ...blank(), ...d }; } catch {}
const saveDraft = () => { try { localStorage.setItem("gc.tm.draft", JSON.stringify(st.draft)); } catch {} };

// ---- Gear data ----
let LOOT = null, BYID = new Map(), loading = null;
function loadLoot() {
  if (loading) return loading;
  loading = fetch("loot-items.json?v=1").then((r) => r.json()).then((d) => {
    LOOT = d.filter((r) => SLOTS.some((s) => s[2].includes(r[3])));
    LOOT.forEach((r) => BYID.set(r[0], r));
    render();
  }).catch(() => { LOOT = []; render(); });
  return loading;
}

// ---- Icons from Wowhead's tooltip service (cached in this browser) ----
const ICONS = new Map(); let queue = [], active = 0;
try { Object.entries(JSON.parse(localStorage.getItem("gc.tm.icons") || "{}")).forEach(([k, v]) => ICONS.set(Number(k), v)); } catch {}
let iconSaveTimer = null;
function saveIcons() { clearTimeout(iconSaveTimer); iconSaveTimer = setTimeout(() => { try { const o = {}; [...ICONS].slice(-1500).forEach(([k, v]) => { if (v) o[k] = v; }); localStorage.setItem("gc.tm.icons", JSON.stringify(o)); } catch {} }, 800); }
function needIcon(id) { if (!ICONS.has(id) && !queue.includes(id)) { queue.push(id); pump(); } }
function pump() {
  while (active < 6 && queue.length) {
    const id = queue.shift(); active++;
    fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}`).then((r) => r.json()).then((d) => { ICONS.set(id, d && /^[a-z0-9_]+$/i.test(d.icon || "") ? d.icon : ""); })
      .catch(() => ICONS.set(id, "")).finally(() => { active--; saveIcons(); paintIcons(); pump(); });
  }
}
function iconImg(id, slot, size) {
  const ic = id ? ICONS.get(id) : EMPTY_ICON[slot];
  if (id && ic === undefined) needIcon(id);
  return `<img data-icon-for="${id || ""}" src="${ic ? iconUrl(ic, size) : iconUrl(EMPTY_ICON[slot] || "inv_misc_questionmark", size)}" alt="" loading="lazy" class="${id ? "" : "tm-empty-ic"}">`;
}
let paintTimer = null;
function paintIcons() {
  clearTimeout(paintTimer);
  paintTimer = setTimeout(() => root.querySelectorAll("img[data-icon-for]").forEach((img) => {
    const id = Number(img.dataset.iconFor); const ic = id && ICONS.get(id);
    if (ic && !img.src.includes(ic)) img.src = img.src.replace(/icons\/(\w+)\/[^/]+\.jpg$/, `icons/$1/${ic}.jpg`);
  }), 120);
}

// ---- Helpers ----
const armorOf = (d) => d.armor || (d.cls && CLASSES[d.cls]) || "";
function fits(r, slotKey, armor) {
  const s = SLOT_BY[slotKey]; if (!s[2].includes(r[3])) return false;
  if (s[3] === "armor") return r[4] === 4 && (!armor || r[5] === ARMOR_ID[armor]);
  if (s[3] === "back") return true;
  return true;
}
const itemName = (id) => (BYID.get(id) || [])[1] || "Item " + id;
const itemQ = (id) => (BYID.get(id) || [])[2] || 1;
const itemFrom = (r) => {
  const src = String(r[8] || "").split(".").filter(Boolean).map(Number);
  if (r[9]) return `Drops from ${r[9]}`;
  return src.map((x) => SOURCE[x]).filter(Boolean).join(", ") || "";
};
const classIcon = (c) => (c ? `<img class="tm-cls-ic" src="${iconUrl("classicon_" + c.toLowerCase(), "large")}" alt="" width="40" height="40">` : "");

// ---- Views ----
function slotBtn(key) {
  const [, label] = SLOT_BY[key], id = st.draft.items[key];
  return `<button class="tm-slot q${id ? itemQ(id) : 0} ${st.pick === key ? "on" : ""}" data-tm="pick" data-slot="${key}" title="${esc(id ? itemName(id) : label + ": pick an appearance")}">
    ${iconImg(id, key)}<span class="tm-slot-txt"><small>${esc(label)}</small><b class="q${id ? itemQ(id) : 0}">${esc(id ? itemName(id) : "Empty")}</b></span></button>`;
}

function pickerHtml() {
  const key = st.pick; if (!key) return "";
  const [, label, , kind] = SLOT_BY[key];
  if (!LOOT) { loadLoot(); return `<div class="tm-picker card"><p class="muted">Opening the wardrobe…</p></div>`; }
  const armor = armorOf(st.draft), q = st.q.trim().toLowerCase();
  const list = LOOT.filter((r) => fits(r, key, armor) && (!q || r[1].toLowerCase().includes(q) || String(r[9] || "").toLowerCase().includes(q)))
    .sort((a, b) => b[2] - a[2] || b[7] - a[7]).filter(((seen) => (r) => !seen.has(r[1]) && seen.add(r[1]))(new Set())).slice(0, 60); // one of each name
  const cur = st.draft.items[key];
  return `<div class="tm-picker card" role="dialog" aria-label="Choose ${esc(label)}">
    <div class="tm-pick-head"><h3>${esc(label)}${kind === "armor" && armor ? ` <span class="muted small">${esc(armor)} only</span>` : ""}</h3>
      <button class="ai-icon" data-tm="close-pick" aria-label="Close">✕</button></div>
    <input type="search" id="tm-q" value="${esc(st.q)}" placeholder="Search ${esc(label.toLowerCase())} by name or boss" aria-label="Search ${esc(label)}">
    ${cur ? `<div class="tm-cur">Wearing <a class="q${itemQ(cur)}" href="${whItem(cur)}" target="_blank" rel="noopener">${esc(itemName(cur))}</a> · <a href="${whItem(cur)}" target="_blank" rel="noopener" title="Wowhead item pages have a View in 3D button">See it in 3D on Wowhead</a> · <button class="linkish" data-tm="clear-slot">Take it off</button></div>` : ""}
    <div class="tm-list">${list.map((r) => `<button class="tm-opt ${cur === r[0] ? "on" : ""}" data-tm="wear" data-id="${r[0]}">
        ${iconImg(r[0], key, "medium")}<span><b class="q${r[2]}">${esc(r[1])}</b><small>${QNAME[r[2]] || ""} · level ${r[7]}${itemFrom(r) ? " · " + esc(itemFrom(r)) : ""}</small></span></button>`).join("")
      || `<p class="muted">Nothing matches. Try another search${kind === "armor" ? " or armor type" : ""}.</p>`}</div>
    <p class="muted small">Showing the best ${list.length} matches. Transmog in WoW Forever only works within the same armor type, so the list follows the armor you picked.</p>
  </div>`;
}

function wardrobeHtml() {
  const d = st.draft, armor = armorOf(d), color = CLASS_COLOR[d.cls] || "var(--brass)";
  const worn = SLOTS.filter((s) => d.items[s[0]]);
  const me = ctx().uid && ctx().uid();
  const mine = st.outfits.filter((o) => o.user === me);
  return `
  <div class="tm-controls card">
    <div class="tm-row">
      <label>Outfit name <input type="text" id="tm-name" maxlength="40" value="${esc(d.name)}" placeholder="e.g. Crimson Crusader"></label>
      <label>Class <select id="tm-cls"><option value="">Any class</option>${Object.keys(CLASSES).map((c) => `<option ${d.cls === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <div><span class="tm-lab">Armor type</span><div class="chips">${(d.cls ? ARMOR_LEVELS[CLASSES[d.cls]] : ARMORS).map((a) => `<button class="chip" data-tm="armor" data-v="${a}" aria-pressed="${armor === a}">${a}</button>`).join("")}</div></div>
    </div>
    ${d.cls ? `<p class="muted small">${d.cls}s wear ${CLASSES[d.cls] === "Cloth" ? "cloth" : CLASSES[d.cls] === "Leather" ? "leather" : `${ARMOR_LEVELS[CLASSES[d.cls]][0].toLowerCase()}, then ${CLASSES[d.cls].toLowerCase()} from level 40`}. Pick the armor type your character wears now.</p>` : ""}
  </div>
  <div class="tm-stage">
    <div class="tm-col">${LEFT.map(slotBtn).join("")}</div>
    <div class="tm-figure" style="--cc:${color}">
      <div class="tm-figure-top">${classIcon(d.cls)}<div><h3>${esc(d.name || "Untitled outfit")}</h3><p class="muted small">${esc([d.cls, armor].filter(Boolean).join(" · ") || "Pick a class and armor type")}</p></div></div>
      <div class="tm-mannequin" aria-hidden="true">
        ${["head", "shoulder", "chest", "hands", "main", "legs", "feet"].map((k) => `<span class="tm-mq tm-mq-${k}">${d.items[k] ? iconImg(d.items[k], k) : ""}</span>`).join("")}
      </div>
      <ul class="tm-worn">${worn.map((s) => `<li><span class="muted">${esc(s[1])}</span> <a class="q${itemQ(d.items[s[0]])}" href="${whItem(d.items[s[0]])}" target="_blank" rel="noopener">${esc(itemName(d.items[s[0]]))}</a></li>`).join("") || `<li class="muted">Click a slot to start dressing up.</li>`}</ul>
      <textarea id="tm-note" rows="2" maxlength="200" placeholder="A note for the guild: where to farm it, the theme, a dye tip…">${esc(d.note)}</textarea>
      <div class="tm-actions">
        ${me ? `<button class="btn primary" data-tm="save">${d.id ? "Save changes" : "Save and share with the guild"}</button>` : `<button class="btn primary" data-tm="signin">Sign in to save outfits</button>`}
        <button class="btn" data-tm="new">New outfit</button>
      </div>
      ${st.msg ? `<p class="saved">${esc(st.msg)}</p>` : ""}
    </div>
    <div class="tm-col">${RIGHT.map(slotBtn).join("")}</div>
    <div class="tm-bottom">${BOTTOM.map(slotBtn).join("")}</div>
  </div>
  ${pickerHtml()}
  ${me ? `<h3 class="sec">My outfits</h3>${mine.length ? `<div class="tm-run">${mine.map(outfitCard).join("")}</div>` : `<p class="muted">You haven't saved any outfits yet.</p>`}` : ""}`;
}

function outfitCard(o) {
  const name = ctx().name ? ctx().name(o.user) : "Member", me = ctx().uid && ctx().uid();
  return `<article class="tm-card" style="--cc:${CLASS_COLOR[o.cls] || "var(--brass)"}">
    <header>${classIcon(o.cls)}<div><h4>${esc(o.name)}</h4><p class="muted small">by ${esc(name)}${o.cls ? " · " + esc(o.cls) : ""}${o.armor ? " · " + esc(o.armor) : ""}</p></div></header>
    <div class="tm-card-icons">${SLOTS.filter((s) => o.items[s[0]]).map((s) => `<a href="${whItem(o.items[s[0]])}" target="_blank" rel="noopener" title="${esc(s[1])}" data-wh-rename-link="false">${iconImg(Number(o.items[s[0]]), s[0], "medium")}</a>`).join("") || `<span class="muted small">No pieces yet</span>`}</div>
    ${o.note ? `<p class="small">${esc(o.note)}</p>` : ""}
    <div class="tm-card-act"><button class="btn small" data-tm="try" data-id="${esc(o.id)}">${o.user === me ? "Edit" : "Try it on"}</button>
      ${o.user === me ? `<button class="btn small danger" data-tm="del" data-id="${esc(o.id)}">Delete</button>` : ""}</div>
  </article>`;
}

function runwayHtml() {
  if (!(ctx().uid && ctx().uid())) return `<div class="card empty"><strong>Sign in to see the guild's outfits.</strong>Members save their transmog looks here for everyone to try on.<div style="margin-top:12px"><button class="btn primary" data-tm="signin">Sign in</button></div></div>`;
  if (!st.loaded) return `<p class="muted">Gathering the guild's outfits…</p>`;
  const q = st.runQ.trim().toLowerCase();
  const list = st.outfits.filter((o) => (!st.runCls || o.cls === st.runCls) && (!q || (o.name + " " + o.note + " " + (ctx().name ? ctx().name(o.user) : "")).toLowerCase().includes(q)));
  return `<div class="tm-run-filters"><input type="search" id="tm-runq" value="${esc(st.runQ)}" placeholder="Search outfits or members" aria-label="Search outfits">
      <div class="chips"><button class="chip" data-tm="runcls" data-v="" aria-pressed="${!st.runCls}">All classes</button>${Object.keys(CLASSES).map((c) => `<button class="chip" data-tm="runcls" data-v="${c}" aria-pressed="${st.runCls === c}">${c}</button>`).join("")}</div></div>
    ${list.length ? `<div class="tm-run">${list.map(outfitCard).join("")}</div>` : `<div class="card empty"><strong>No outfits yet.</strong>Be the first: build one in the Wardrobe tab and save it.</div>`}`;
}

function infoHtml() {
  return `<div class="tm-info">
    <article class="fn-card"><p class="fn-kicker">Getting started</p><h4>Switch it on</h4><p>Transmog starts turned off. Talk to a Transmogrifier in a capital city to switch it on, and back off whenever you like. You keep collecting appearances either way.</p></article>
    <article class="fn-card"><p class="fn-kicker">The rules</p><h4>Same armor type only</h4><p>You can only change a piece's look to another piece of the same armor type, so no plate-wearing gnome mages. Weapon rules haven't been fully published yet.</p></article>
    <article class="fn-card"><p class="fn-kicker">Outfits</p><h4>Saved looks and Situations</h4><p>Looks are saved as outfits. <strong>Situations</strong> can swap outfits for you when you mount up, swim, change zone, or as the weather and time of day change.</p></article>
    <article class="fn-card"><p class="fn-kicker">Collecting</p><h4>Account-wide</h4><p>An appearance you unlock works on all your characters. Epic raid gear only gives its look to the person who actually wins the item, so no one needs to roll just for looks.</p></article>
  </div>
  <p class="muted small">From WoW Forever transmog guides (Method, Icy Veins, Warcraft Tavern, Wowhead). Blizzard hasn't published every detail, such as the full cost and weapon rules, so check in game.</p>`;
}

let outfitsBusy = false;
async function loadOutfits() {
  if (outfitsBusy) return; outfitsBusy = true;
  try { await loadOutfitsNow(); } finally { outfitsBusy = false; }
}
async function loadOutfitsNow() {
  const B = ctx().backend && ctx().backend();
  if (!B || !B.loadOutfits || !(ctx().uid && ctx().uid())) return;
  try { st.outfits = await B.loadOutfits(); } catch (e) { st.msg = "Couldn't load outfits: " + (e.message || "try again"); }
  st.loaded = true;
  // Fetch names for every piece in every outfit.
  if (!LOOT) loadLoot();
  render();
}

function render() {
  if (root.hidden && root.dataset.built) return;
  if (!root.dataset.built) { root.dataset.built = "1"; loadLoot(); }
  if (!st.loaded && ctx().uid && ctx().uid()) loadOutfits();
  const focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : "";
  root.innerHTML = `
    <div class="map-head board-head"><div><p class="eyebrow">Bark and Stone · Wardrobe</p><h2 class="hero-title">Transmog wardrobe</h2>
      <p class="muted map-intro">Dress up your character in any gear from WoW Forever, save the look, and show it off to the guild.</p></div>
      <div class="lm-tabs" role="tablist">
        ${[["wardrobe", "🧥 Wardrobe"], ["runway", "✨ Guild runway"], ["info", "📜 How transmog works"]].map(([k, l]) => `<button class="chip" role="tab" data-tm="tab" data-v="${k}" aria-selected="${st.tab === k}" aria-pressed="${st.tab === k}">${l}</button>`).join("")}
      </div></div>
    ${st.tab === "wardrobe" ? wardrobeHtml() : st.tab === "runway" ? runwayHtml() : infoHtml()}`;
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (el.setSelectionRange && el.value != null) el.setSelectionRange(el.value.length, el.value.length); } }
  paintIcons();
}

root.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-tm]"); if (!b) return;
  const a = b.dataset.tm, d = st.draft;
  if (a === "tab") { st.tab = b.dataset.v; st.pick = null; st.msg = ""; }
  else if (a === "pick") { st.pick = st.pick === b.dataset.slot ? null : b.dataset.slot; st.q = ""; loadLoot(); }
  else if (a === "close-pick") st.pick = null;
  else if (a === "wear") { d.items[st.pick] = Number(b.dataset.id); saveDraft(); st.msg = ""; }
  else if (a === "clear-slot") { delete d.items[st.pick]; saveDraft(); }
  else if (a === "armor") {
    d.armor = b.dataset.v;
    // Take off armor pieces that no longer fit.
    if (LOOT) SLOTS.forEach(([k, , , kind]) => { const r = BYID.get(d.items[k]); if (kind === "armor" && r && r[5] !== ARMOR_ID[d.armor]) delete d.items[k]; });
    saveDraft();
  }
  else if (a === "new") { st.draft = blank(); st.pick = null; st.msg = ""; saveDraft(); }
  else if (a === "signin") { if (ctx().signIn) ctx().signIn(); return; }
  else if (a === "save") {
    if (!d.name.trim()) { st.msg = "Give your outfit a name first."; render(); $("#tm-name") && $("#tm-name").focus(); return; }
    if (!Object.keys(d.items).length) { st.msg = "Add at least one piece first."; render(); return; }
    b.disabled = true;
    try {
      const id = await ctx().backend().saveOutfit({ ...d, name: d.name.trim().slice(0, 40), armor: armorOf(d) });
      d.id = id; saveDraft(); st.msg = "Saved. The guild can see it on the Guild runway."; st.loaded = false; await loadOutfits(); return;
    } catch (x) { st.msg = "Couldn't save: " + (x.message || "try again"); }
  }
  else if (a === "try") {
    const o = st.outfits.find((x) => x.id === b.dataset.id); if (!o) return;
    const mineO = o.user === (ctx().uid && ctx().uid());
    st.draft = { id: mineO ? o.id : null, name: mineO ? o.name : o.name + " (copy)", cls: o.cls, armor: o.armor, items: Object.fromEntries(Object.entries(o.items).map(([k, v]) => [k, Number(v)])), note: mineO ? o.note : "" };
    saveDraft(); st.tab = "wardrobe"; st.pick = null; st.msg = mineO ? "Editing your outfit." : "Trying on a guildmate's outfit. Save it to keep your own copy.";
    window.scrollTo({ top: root.offsetTop - 20, behavior: "smooth" });
  }
  else if (a === "del") {
    if (!confirm("Delete this outfit? This can't be undone.")) return;
    try { await ctx().backend().deleteOutfit(b.dataset.id); if (st.draft.id === b.dataset.id) st.draft.id = null; st.loaded = false; await loadOutfits(); return; }
    catch (x) { st.msg = "Couldn't delete: " + (x.message || "try again"); }
  }
  else if (a === "runcls") st.runCls = b.dataset.v;
  render();
});
root.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "tm-q") { st.q = t.value; render(); }
  else if (t.id === "tm-runq") { st.runQ = t.value; render(); }
  else if (t.id === "tm-name") { st.draft.name = t.value; saveDraft(); const h = $(".tm-figure h3"); if (h) h.textContent = t.value || "Untitled outfit"; }
  else if (t.id === "tm-note") { st.draft.note = t.value; saveDraft(); }
});
root.addEventListener("change", (e) => {
  if (e.target.id === "tm-cls") {
    const d = st.draft; d.cls = e.target.value;
    if (d.cls && !ARMOR_LEVELS[CLASSES[d.cls]].includes(d.armor)) d.armor = CLASSES[d.cls];
    if (LOOT) SLOTS.forEach(([k, , , kind]) => { const r = BYID.get(d.items[k]); if (kind === "armor" && r && d.armor && r[5] !== ARMOR_ID[d.armor]) delete d.items[k]; });
    saveDraft(); render();
  }
});
window.addEventListener("hashchange", () => { if (location.hash === "#transmog") { st.loaded = false; } });

window.GC_TRANSMOG = { render, reset: () => { st.loaded = false; st.outfits = []; } };
})();
