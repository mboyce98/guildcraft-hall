/* GuildCraft Hall — page logic. Data access lives in backend.js. */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const fmt = (n) => Number(n).toLocaleString("en-US");
const gold = (g) => { g = Number(g) || 0; if (g <= 0) return '<span class="muted">—</span>'; return `<span class="gold">${fmt(Math.round(g * 100) / 100)}g</span>`; };
const ago = (t) => { if (!t) return ""; const s = (Date.now() - t) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
const SRC = { 1: "Crafted", 2: "World drop", 4: "Quest", 5: "Vendor", 6: "Trainer", 16: "Fishing", 21: "Pickpocket" };
const FINISHED = new Set(["done", "declined", "cancelled"]);

/* ---------- state ---------- */
const S = {
  view: "recipes", q: "", prof: -1, hasCrafter: false, onlyNew: false, limit: 150, sel: null, reqFor: null,
  B: null, me: null, uid: null, loaded: false,
  crafters: new Map(), requests: [], listings: [], profiles: {},
  myDoc: null, pendingSave: false, editChar: lsGet("gc.editChar"), editProf: null, mineQ: "", saveState: "",
  reqTab: "open", mq: "", mtype: "", authTab: "in",
};
let PROFS = [], ITEMS = {}, RECIPES = [], BYID = new Map(), INDEX = new Map(), DATA_OK = false;
let renderQueued = false;
const isTrainer = (r) => !r.src.length || r.src.includes(6);

/* ---------- recipe data ---------- */
fetch("recipes.json").then((r) => r.json()).then((d) => {
  PROFS = d.professions; ITEMS = d.items;
  RECIPES = d.recipes.map((a) => {
    const [id, name, p, lv, colors, cr, cmin, cmax, mats, q, src, isNew] = a;
    const item = ITEMS[cr];
    const r = { id, name, p, lv, colors: colors || [], cr, cmin, cmax, mats, q: item ? item[1] : (q >= 0 ? q : 1), src, isNew: !!isNew };
    r.s = (name + " " + (item ? item[0] : "") + " " + mats.map((m) => (ITEMS[m[0]] || [""])[0]).join(" ")).toLowerCase();
    return r;
  }).sort((a, b) => a.p - b.p || a.lv - b.lv || a.name.localeCompare(b.name));
  RECIPES.forEach((r) => BYID.set(r.id, r));
  DATA_OK = true;
  route();
}).catch(() => { $("#view-recipes").innerHTML = `<div class="empty"><strong>The recipe list didn't load.</strong>Refresh the page to try again.</div>`; });

const itemName = (id) => (ITEMS[id] || ["Item #" + id])[0];
const itemQ = (id) => (ITEMS[id] || [0, 1])[1];
const profName = (i) => PROFS[i] || "?";
const profIndex = (name) => PROFS.indexOf(name);
const userName = (uid) => (S.profiles[uid] && S.profiles[uid].username) || "";
const myChars = () => Object.keys((S.myDoc && S.myDoc.chars) || {});
function defaultChar() { const saved = lsGet("gc.char"); const mine = myChars(); return saved && mine.includes(saved) ? saved : (mine[0] || saved || ""); }

/* ---------- backend ---------- */
(async () => {
  S.B = await openBackend();
  $("#demo-note").hidden = S.B.mode !== "demo";
  S.B.onChange(() => queueRefresh());
  S.B.onAuthChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") $("#newpass").hidden = false;
    await loadMe(); queueRefresh(true);
  });
  await loadMe();
  await refresh();
  setInterval(() => { if (S.uid && document.visibilityState === "visible") refresh(); }, 60000);
})();

async function loadMe() {
  try { S.me = await S.B.currentUser(); } catch { S.me = null; }
  if ((S.me && S.me.id) !== S.uid) { S.myDoc = null; S.crafters = new Map(); S.requests = []; S.listings = []; }
  S.uid = S.me ? S.me.id : null;
  $("#who").innerHTML = S.me
    ? `<span>Signed in as <strong>${esc(S.me.username)}</strong></span><button class="btn small" data-act="signout">Sign out</button>`
    : `<button class="btn small primary" data-act="signin">Sign in</button>`;
}

let refreshTimer = null;
function queueRefresh(now) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, now ? 0 : 400); }
async function refresh() {
  if (!S.uid) { S.loaded = true; buildIndex(); render(); return; }
  try {
    const d = await S.B.loadAll();
    S.profiles = d.profiles;
    S.crafters = new Map(d.crafters.map((c) => [c.uid, c]));
    S.requests = d.requests; S.listings = d.listings;
    if (!S.pendingSave) { const mine = S.crafters.get(S.uid); S.myDoc = mine ? structuredClone({ chars: mine.chars, note: mine.note }) : (S.myDoc || null); }
    S.loaded = true; setStatus("");
  } catch (e) { setStatus("<strong>Guild data didn't load.</strong> " + esc(e.message || "") + " It will retry in a minute."); }
  buildIndex(); render();
}
function setStatus(html) { const el = $("#status-note"); el.innerHTML = html; el.hidden = !html; }
function note(msg) { setStatus(`<strong>${esc(msg)}</strong>`); $("#status-note").scrollIntoView({ block: "nearest" }); }

function buildIndex() {
  INDEX = new Map();
  for (const [uid, doc] of S.crafters) {
    for (const [char, c] of Object.entries(doc.chars || {})) {
      for (const [prof, p] of Object.entries(c.profs || {})) {
        for (const id of p.known || []) {
          if (!INDEX.has(id)) INDEX.set(id, []);
          INDEX.get(id).push({ uid, char, skill: p.skill || 0, prof, note: doc.note || "" });
        }
      }
    }
  }
}

/* ---------- routing ---------- */
function route() {
  const h = location.hash.slice(1);
  let view = "recipes";
  if (/^recipe-\d+$/.test(h)) S.sel = Number(h.slice(7));
  else if (["recipes", "mine", "requests", "market"].includes(h)) view = h;
  S.view = view;
  document.querySelectorAll("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === view ? "page" : "false"));
  ["recipes", "mine", "requests", "market"].forEach((v) => ($("#view-" + v).hidden = v !== view));
  render();
}
window.addEventListener("hashchange", route);

function render() {
  if (renderQueued) return; renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    if (!DATA_OK) { $("#view-recipes").innerHTML = `<div class="empty"><strong>Loading 2,215 recipes…</strong></div>`; return; }
    const open = S.requests.filter((r) => r.to === S.uid && r.status === "pending").length;
    const b = $("#req-badge"); b.textContent = open; b.hidden = !open;
    const a = document.activeElement;
    const typing = a && a.matches && a.matches("input[type=text],input[type=number],input[type=password],textarea") ? a : null;
    if (S.view === "recipes") renderRecipes();
    else if (S.view === "mine") { if (!(typing && typing.closest("#view-mine"))) renderMine(); }
    else if (S.view === "requests") renderRequests();
    else renderMarket();
  }, 0);
}
const signInPrompt = (what) => `<div class="card empty"><strong>Sign in to ${what}.</strong>Guild members share recipes, requests and listings once they're signed in.<div style="margin-top:12px"><button class="btn primary" data-act="signin">Sign in or create an account</button></div></div>`;

/* ---------- Recipes ---------- */
function skillBar(r) {
  const c = r.colors; if (!c || c.length < 4) return "";
  const max = Math.max(c[3] + 10, 1), min = Math.min(r.lv, c[0]);
  const span = Math.max(max - min, 1); const w = (v) => Math.max(0, (v / span) * 100);
  return `<span class="bar" title="Orange ${c[0]} · Yellow ${c[1]} · Green ${c[2]} · Grey ${c[3]}"><i style="width:${w(c[1] - c[0])}%;background:var(--sk-o)"></i><i style="width:${w(c[2] - c[1])}%;background:var(--sk-y)"></i><i style="width:${w(c[3] - c[2])}%;background:var(--sk-g)"></i><i style="flex:1;background:var(--sk-x)"></i></span>`;
}
function filteredRecipes() {
  const q = S.q.trim().toLowerCase();
  return RECIPES.filter((r) => (S.prof < 0 || r.p === S.prof) && (!S.onlyNew || r.isNew) && (!S.hasCrafter || INDEX.has(r.id)) && (!q || r.s.includes(q)));
}
function renderRecipes() {
  const root = $("#view-recipes");
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="filters">
        <input type="search" id="rq" placeholder="Search recipes, items or materials (e.g. Thorium Bar)" aria-label="Search recipes">
        <label class="chk"><input type="checkbox" id="rhas"> Someone in the guild can craft it</label>
        <label class="chk"><input type="checkbox" id="rnew"> New in Forever</label>
      </div>
      <div class="chips" id="rprofs" style="margin-bottom:12px"></div>
      <div class="ledger">
        <div><div class="table-wrap"><table>
          <thead><tr><th>Recipe</th><th class="hide-sm">Profession</th><th>Skill</th><th>Crafters</th></tr></thead>
          <tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>
        <aside class="sheet" id="sheet" aria-label="Recipe details"></aside>
      </div>`;
    $("#rq").addEventListener("input", (e) => { S.q = e.target.value; S.limit = 150; renderRecipes(); });
    $("#rhas").addEventListener("change", (e) => { S.hasCrafter = e.target.checked; S.limit = 150; renderRecipes(); });
    $("#rnew").addEventListener("change", (e) => { S.onlyNew = e.target.checked; S.limit = 150; renderRecipes(); });
  }
  const counts = PROFS.map((_, i) => RECIPES.filter((r) => r.p === i).length);
  $("#rprofs").innerHTML = `<button class="chip" data-prof="-1" aria-pressed="${S.prof < 0}">All<span class="n">${fmt(RECIPES.length)}</span></button>` +
    PROFS.map((p, i) => `<button class="chip" data-prof="${i}" aria-pressed="${S.prof === i}">${esc(p)}<span class="n">${counts[i]}</span></button>`).join("");
  const list = filteredRecipes();
  const shown = list.slice(0, S.limit);
  $("#rbody").innerHTML = shown.length ? shown.map((r) => {
    const cs = INDEX.get(r.id) || [];
    return `<tr class="click" data-recipe="${r.id}" aria-selected="${S.sel === r.id}" tabindex="0">
      <td><span class="rname q${r.q}">${esc(r.name)}</span>${r.isNew ? '<span class="tag new">New</span>' : ""}</td>
      <td class="hide-sm muted">${esc(profName(r.p))}</td>
      <td><span class="skill">${r.lv} ${skillBar(r)}</span></td>
      <td class="crafters-n ${cs.length ? "has" : ""}">${cs.length ? cs.length : '<span class="muted">' + (S.uid ? "0" : "–") + "</span>"}</td></tr>`;
  }).join("") : `<tr><td colspan="4"><div class="empty"><strong>No recipes match.</strong>Try a different search or profession.</div></td></tr>`;
  $("#rmore").innerHTML = list.length > S.limit ? `<div class="more"><button class="btn" data-act="more">Show more (${fmt(list.length - S.limit)} left)</button></div>` :
    `<div class="more muted num">${fmt(list.length)} recipe${list.length === 1 ? "" : "s"}</div>`;
  const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#reqform");
  if (!typing) renderSheet();
}

function renderSheet() {
  const el = $("#sheet"); if (!el) return;
  const r = S.sel && BYID.get(S.sel);
  el.dataset.empty = r ? "false" : "true";
  if (!r) { el.innerHTML = `<div class="empty"><strong>Pick a recipe</strong>See its materials, skill-up ranks and who in the guild can craft it.</div>`; return; }
  const c = r.colors.length >= 4 ? r.colors : [r.lv, r.lv, r.lv, r.lv];
  const crafters = (INDEX.get(r.id) || []).slice().sort((a, b) => b.skill - a.skill);
  const creates = r.cr ? `Creates <span class="q${itemQ(r.cr)}">${esc(itemName(r.cr))}</span>${r.cmax > 1 ? ` ×${r.cmin === r.cmax ? r.cmin : r.cmin + "–" + r.cmax}` : ""}` : "Enchant / effect";
  const src = r.src.map((s) => SRC[s] || "Other").join(", ") || "Trainer (likely)";
  let who;
  if (!S.uid) who = `<p class="muted" style="margin:0"><button class="btn small primary" data-act="signin">Sign in</button> to see who in the guild can craft this.</p>`;
  else if (!crafters.length) who = `<p class="muted" style="margin:0">Nobody has listed this recipe yet. Crafters add theirs on the <a href="#mine">My crafter</a> tab.</p>`;
  else who = crafters.map((x, i) => {
    const mine = x.uid === S.uid; const un = userName(x.uid);
    return `<div class="crafter"><div><div class="nm">${esc(x.char)}${mine ? ' <span class="muted">(you)</span>' : ""}</div>
      <div class="rl">${un ? esc(un) + " · " : ""}${esc(x.prof)} ${x.skill || ""}</div>${x.note ? `<div class="note">${esc(x.note)}</div>` : ""}</div>
      ${mine ? "" : `<button class="btn small primary" data-act="ask" data-i="${i}">Request</button>`}</div>
      ${S.reqFor && S.reqFor.uid === x.uid && S.reqFor.char === x.char ? requestForm() : ""}`;
  }).join("");
  el.innerHTML = `
    <div class="head">
      <div><h2 class="q${r.q}">${esc(r.name)}</h2>
      <div class="sub">${esc(profName(r.p))} · learned at ${r.lv} · ${esc(src)}${r.isNew ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
      <button class="btn small close" data-act="close-sheet" aria-label="Close">Close</button>
    </div>
    <p class="muted" style="margin:10px 0 0">${creates}</p>
    <div class="ranks" aria-label="Skill-up ranks">
      <div style="border-color:var(--sk-o)">${c[0]}</div><div style="border-color:var(--sk-y)">${c[1]}</div>
      <div style="border-color:var(--sk-g)">${c[2]}</div><div style="border-color:var(--sk-x)">${c[3]}</div>
    </div>
    <h3>Materials</h3>
    <ul class="mats">${r.mats.map((m) => `<li><span class="q${itemQ(m[0])}">${esc(itemName(m[0]))}</span><span class="num muted">×${m[1]}</span></li>`).join("")}</ul>
    <h3>Guild crafters${S.uid ? ` (${crafters.length})` : ""}</h3>
    <div>${who}</div>
    <p style="margin:14px 0 0"><a href="https://www.wowhead.com/forever/spell=${r.id}" target="_blank" rel="noopener">View on Wowhead</a></p>`;
  el._crafters = crafters;
}
function requestForm() {
  return `<form class="form" id="reqform">
    <div class="row"><label for="rf-char">Your character</label><input type="text" id="rf-char" value="${esc(defaultChar())}" required maxlength="24" placeholder="Who should receive it"></div>
    <div class="row"><label for="rf-qty">Quantity</label><input type="number" id="rf-qty" value="1" min="1" max="999"></div>
    <div class="row"><label for="rf-tip">Tip (gold)</label><input type="number" id="rf-tip" min="0" step="0.01" placeholder="0"></div>
    <div class="row"><label for="rf-note">Note</label><input type="text" id="rf-note" maxlength="140" placeholder="I'll bring the mats / when you're online"></div>
    <div class="actions"><button type="button" class="btn" data-act="cancel-ask">Cancel</button><button class="btn primary" type="submit">Send request</button></div>
  </form>`;
}

/* ---------- My crafter ---------- */
function ensureMyDoc() { if (!S.myDoc) S.myDoc = { chars: {}, note: "" }; if (!S.myDoc.chars) S.myDoc.chars = {}; return S.myDoc; }
let saveTimer = null, saving = Promise.resolve();
function queueSave() {
  if (!S.uid) return;
  S.pendingSave = true; S.saveState = "Saving…"; updateSaved();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const body = structuredClone(ensureMyDoc());
    saving = saving.then(() => S.B.saveMine(body))
      .then(() => { S.saveState = "Saved. The guild can see your recipes."; S.crafters.set(S.uid, { uid: S.uid, ...body }); })
      .catch((e) => { S.saveState = "Couldn't save: " + (e.message || "try again in a moment") + ". Your changes are kept on this page."; })
      .finally(() => { S.pendingSave = false; updateSaved(); buildIndex(); });
  }, 700);
}
function updateSaved() { const el = $("#saved"); if (el) el.textContent = S.saveState; }

function renderMine() {
  const root = $("#view-mine");
  if (!S.uid) { root.innerHTML = signInPrompt("list what you can craft"); return; }
  const doc = ensureMyDoc();
  const chars = Object.keys(doc.chars);
  if (!S.editChar || !doc.chars[S.editChar]) S.editChar = chars[0] || null;
  const ch = S.editChar && doc.chars[S.editChar];
  const profs = ch ? Object.keys(ch.profs || {}) : [];
  if (!S.editProf || !profs.includes(S.editProf)) S.editProf = profs[0] || null;
  const left = `
    <div class="card">
      <h2>Your characters</h2>
      <div style="display:grid;gap:4px">${chars.map((c) => {
        const n = Object.values(doc.chars[c].profs || {}).reduce((s, p) => s + (p.known || []).length, 0);
        return `<button class="list-btn" data-act="pick-char" data-char="${esc(c)}" aria-pressed="${c === S.editChar}"><span>${esc(c)}</span><span class="muted num">${n} recipes</span></button>`;
      }).join("") || `<p class="muted" style="margin:0 0 6px">Add the character that does your crafting.</p>`}</div>
      <form class="inline" id="addchar" style="margin-top:10px"><input type="text" id="newchar" maxlength="24" placeholder="Character name" aria-label="Character name"><button class="btn" type="submit">Add</button></form>
      <h3>Crafter note</h3>
      <textarea id="mynote" rows="3" maxlength="200" placeholder="e.g. Bring mats, free for guildies. Online most evenings.">${esc(doc.note || "")}</textarea>
      <p class="saved" id="saved">${esc(S.saveState)}</p>
    </div>`;
  let right;
  if (!ch) right = `<div class="card empty"><strong>Add a character to start.</strong>Then add their professions and tick the recipes they know.</div>`;
  else {
    const avail = PROFS.filter((p) => !profs.includes(p));
    const p = S.editProf && ch.profs[S.editProf];
    const pi = profIndex(S.editProf);
    let body = `<p class="muted">Add a profession to list its recipes.</p>`;
    if (p) {
      const known = new Set(p.known || []);
      const q = S.mineQ.trim().toLowerCase();
      const rs = RECIPES.filter((r) => r.p === pi && (!q || r.s.includes(q)));
      body = `
        <div class="inline" style="margin-top:6px">
          <label class="muted" for="skill">Skill</label><input type="number" id="skill" min="1" max="300" value="${p.skill || 1}" style="width:80px">
          <button class="btn" data-act="mark-trainer">Tick all trainer recipes up to my skill</button>
          <button class="btn danger" data-act="clear-prof">Untick all</button>
          <button class="btn danger" data-act="remove-prof">Remove profession</button>
        </div>
        <div class="inline" style="margin-top:10px"><input type="search" id="mineq" value="${esc(S.mineQ)}" placeholder="Filter ${esc(S.editProf)} recipes" aria-label="Filter recipes" style="flex:1 1 220px">
          <span class="muted num">${known.size} of ${RECIPES.filter((r) => r.p === pi).length} known</span></div>
        <div class="known">${rs.map((r) => `<label><input type="checkbox" data-known="${r.id}" ${known.has(r.id) ? "checked" : ""}><span class="t q${r.q}">${esc(r.name)}</span><span class="lv">${r.lv}</span></label>`).join("")}</div>`;
    }
    right = `<div class="card">
      <div class="inline" style="justify-content:space-between"><h2 style="margin:0">${esc(S.editChar)}</h2><button class="btn small danger" data-act="remove-char">Remove character</button></div>
      <div class="chips" style="margin-top:12px">${profs.map((x) => `<button class="chip" data-act="pick-prof" data-prof="${esc(x)}" aria-pressed="${x === S.editProf}">${esc(x)} <span class="n">${(ch.profs[x].known || []).length}</span></button>`).join("")}
        ${avail.length ? `<select id="addprof" aria-label="Add profession"><option value="">+ Add profession</option>${avail.map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : ""}</div>
      ${body}</div>`;
  }
  root.innerHTML = `<div class="cols">${left}${right}</div>`;
  const nq = $("#mineq"); if (nq && S._focusMine) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
}

/* ---------- Requests ---------- */
function renderRequests() {
  const root = $("#view-requests");
  if (!S.uid) { root.innerHTML = signInPrompt("see your requests"); return; }
  const filt = (r) => (S.reqTab === "open" ? !FINISHED.has(r.status) : FINISHED.has(r.status));
  const inc = S.requests.filter((r) => r.to === S.uid && filt(r)).sort((a, b) => (b.created || 0) - (a.created || 0));
  const out = S.requests.filter((r) => r.from === S.uid && filt(r)).sort((a, b) => (b.created || 0) - (a.created || 0));
  const card = (r, dir) => {
    const other = dir === "in" ? r.from : r.to;
    const otherChar = dir === "in" ? r.fromChar : r.toChar;
    const un = userName(other);
    const verb = r.kind === "craft" ? "Craft" : r.kind === "buy" ? "Buy" : "Sell";
    const rec = r.kind === "craft" && BYID.get(r.recipeId);
    let acts;
    if (dir === "in") acts = r.status === "pending" ? [["accepted", "Accept", "primary"], ["declined", "Decline", ""]] : r.status === "accepted" ? [["done", "Mark done", "primary"], ["declined", "Decline", ""]] : [["delete", "Remove", ""]];
    else acts = r.status === "pending" || r.status === "accepted" ? [["cancelled", "Cancel", ""]] : [["delete", "Remove", ""]];
    const mats = rec && dir === "in" && r.status !== "done" ? `<div class="meta">Mats for ×${r.qty}: ${rec.mats.map((m) => `${esc(itemName(m[0]))} ×${m[1] * (r.qty || 1)}`).join(", ")}</div>` : "";
    return `<div class="req">
      <div><div class="what">${verb}: ${rec ? `<a class="q${rec.q}" href="#recipe-${rec.id}">${esc(rec.name)}</a>` : esc(r.label || "Item")} <span class="num">×${r.qty || 1}</span></div>
        <div class="meta">${dir === "in" ? "From" : "To"} <strong>${esc(otherChar || "?")}</strong>${un ? ` (${esc(un)})` : ""}${dir === "out" && r.fromChar ? ` · for ${esc(r.fromChar)}` : ""}${dir === "in" && r.toChar ? ` · to ${esc(r.toChar)}` : ""} · ${ago(r.created)} · ${r.kind === "craft" ? "Tip" : "Price"} ${gold(r.tip)}</div>
        ${r.note ? `<div class="meta">“${esc(r.note)}”</div>` : ""}${mats}</div>
      <div class="acts"><span class="pill st-${esc(r.status)}">${esc(r.status)}</span>${acts.map((a) => `<button class="btn small ${a[2]}" data-act="req" data-id="${esc(r.id)}" data-st="${a[0]}">${a[1]}</button>`).join("")}</div>
    </div>`;
  };
  root.innerHTML = `
    <div class="chips" style="margin-bottom:14px"><button class="chip" data-act="reqtab" data-t="open" aria-pressed="${S.reqTab === "open"}">Open</button><button class="chip" data-act="reqtab" data-t="closed" aria-pressed="${S.reqTab !== "open"}">Finished</button></div>
    <div class="split">
      <div><h2>Asked of me</h2><div class="box">${inc.map((r) => card(r, "in")).join("") || `<div class="empty"><strong>Nothing for you right now.</strong>List your recipes on My crafter so guildmates can ask.</div>`}</div></div>
      <div><h2>I asked for</h2><div class="box">${out.map((r) => card(r, "out")).join("") || `<div class="empty"><strong>You haven't asked for anything.</strong>Find a recipe and press Request next to a crafter.</div>`}</div></div>
    </div>`;
}

/* ---------- Market ---------- */
function renderMarket() {
  const root = $("#view-market");
  if (!S.uid) { root.dataset.built = ""; root.innerHTML = signInPrompt("use the guild market"); return; }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    const itemNames = [...new Set(Object.values(ITEMS).map((x) => x[0]))].sort();
    root.innerHTML = `
      <div class="cols">
        <div class="card">
          <h2>Post a listing</h2>
          <form class="form" id="postform" style="margin:0">
            <div class="row"><label for="pf-type">Type</label><select id="pf-type"><option value="S">I'm selling</option><option value="B">I want to buy</option></select></div>
            <div class="row"><label for="pf-item">Item</label><input type="text" id="pf-item" list="itemlist" maxlength="60" required placeholder="e.g. Arcanite Bar"></div>
            <div class="row"><label for="pf-qty">Quantity</label><input type="number" id="pf-qty" min="1" max="9999" value="1"></div>
            <div class="row"><label for="pf-price">Price each (gold)</label><input type="number" id="pf-price" min="0" step="0.01" placeholder="Leave empty for offers"></div>
            <div class="row"><label for="pf-char">Character</label><input type="text" id="pf-char" maxlength="24" required></div>
            <div class="row"><label for="pf-note">Note</label><input type="text" id="pf-note" maxlength="140" placeholder="Optional"></div>
            <div class="actions"><button class="btn primary" type="submit">Post</button></div>
          </form>
          <datalist id="itemlist">${itemNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        </div>
        <div>
          <div class="filters"><input type="search" id="mq" placeholder="Search listings" aria-label="Search listings">
            <div class="chips"><button class="chip" data-act="mtype" data-t="">All</button><button class="chip" data-act="mtype" data-t="S">Selling</button><button class="chip" data-act="mtype" data-t="B">Wanted</button></div></div>
          <div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Each</th><th class="hide-sm">By</th><th></th></tr></thead><tbody id="mbody"></tbody></table></div>
        </div>
      </div>`;
    $("#mq").addEventListener("input", (e) => { S.mq = e.target.value; renderMarket(); });
  }
  const pc = $("#pf-char"); if (pc && !pc.value) pc.value = defaultChar();
  root.querySelectorAll('[data-act="mtype"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === S.mtype));
  const q = S.mq.trim().toLowerCase();
  const rows = S.listings.filter((l) => (!S.mtype || l.type === S.mtype) && (!q || String(l.item).toLowerCase().includes(q)))
    .sort((a, b) => String(a.item).localeCompare(String(b.item)) || (a.price || 0) - (b.price || 0));
  const byName = {}; for (const v of Object.values(ITEMS)) byName[v[0].toLowerCase()] = v[1];
  $("#mbody").innerHTML = rows.map((l) => {
    const mine = l.seller === S.uid; const un = userName(l.seller); const qcls = byName[String(l.item).toLowerCase()];
    const act = mine || (S.me && S.me.isAdmin && S.B.mode === "live") ? `<button class="btn small danger" data-act="unlist" data-id="${esc(l.id)}">Remove</button>` : "";
    const deal = !mine ? `<button class="btn small primary" data-act="deal" data-id="${esc(l.id)}">${l.type === "B" ? "Sell to them" : "Buy"}</button>` : "";
    return `<tr><td><span class="tag" style="margin:0 6px 0 0;color:${l.type === "B" ? "var(--warn)" : "var(--ok)"}">${l.type === "B" ? "WTB" : "WTS"}</span><span class="${qcls != null ? "q" + qcls : ""}">${esc(l.item)}</span>${l.note ? `<div class="muted" style="font-size:.8rem">${esc(l.note)}</div>` : ""}</td>
      <td class="num">${l.qty || 1}</td><td>${l.price > 0 ? gold(l.price) : '<span class="muted">offer</span>'}</td>
      <td class="hide-sm">${esc(l.char || "?")}${un ? `<div class="muted" style="font-size:.78rem">${esc(un)}</div>` : ""}</td><td style="text-align:right;white-space:nowrap">${deal} ${act}</td></tr>`;
  }).join("") || `<tr><td colspan="5"><div class="empty"><strong>No listings yet.</strong>Post something you're selling or looking for.</div></td></tr>`;
}

/* ---------- sign-in dialog ---------- */
function openAuth(tab) {
  S.authTab = tab || "in";
  document.querySelectorAll('[data-act="auth-tab"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === S.authTab));
  $("#f-user").hidden = S.authTab !== "up";
  $("#f-pass").hidden = S.authTab === "reset";
  $("#a-pass").autocomplete = S.authTab === "up" ? "new-password" : "current-password";
  $("#a-go").textContent = S.authTab === "up" ? "Create account" : S.authTab === "reset" ? "Email me a reset link" : "Sign in";
  $("#a-err").textContent = ""; $("#a-err").className = "err";
  $("#auth").hidden = false;
  (S.authTab === "up" ? $("#a-user") : $("#a-email")).focus();
}

/* ---------- events ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act],[data-recipe],[data-prof]");
  if (!t) { if (e.target.id === "auth") $("#auth").hidden = true; return; }
  if (t.dataset.recipe) { S.sel = Number(t.dataset.recipe); S.reqFor = null; history.replaceState(null, "", "#recipe-" + S.sel); renderRecipes(); return; }
  if (t.dataset.prof !== undefined && !t.dataset.act) { S.prof = Number(t.dataset.prof); S.limit = 150; renderRecipes(); return; }
  const act = t.dataset.act;
  if (act === "signin") openAuth("in");
  else if (act === "auth-tab") openAuth(t.dataset.t);
  else if (act === "auth-close") $("#auth").hidden = true;
  else if (act === "signout") { try { await S.B.signOut(); } catch {} await loadMe(); refresh(); }
  else if (act === "more") { S.limit += 300; renderRecipes(); }
  else if (act === "close-sheet") { S.sel = null; S.reqFor = null; history.replaceState(null, "", "#recipes"); renderRecipes(); }
  else if (act === "ask") { const x = $("#sheet")._crafters[Number(t.dataset.i)]; S.reqFor = { uid: x.uid, char: x.char }; renderSheet(); const f = $("#rf-char"); if (f) (f.value ? $("#rf-note") : f).focus(); }
  else if (act === "cancel-ask") { S.reqFor = null; renderSheet(); }
  else if (act === "pick-char") { S.editChar = t.dataset.char; lsSet("gc.editChar", S.editChar); S.editProf = null; S.mineQ = ""; renderMine(); }
  else if (act === "pick-prof") { S.editProf = t.dataset.prof; S.mineQ = ""; renderMine(); }
  else if (act === "remove-char" || act === "remove-prof") {
    if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to remove"; return; }
    const d = ensureMyDoc();
    if (act === "remove-char") { delete d.chars[S.editChar]; S.editChar = null; } else { delete d.chars[S.editChar].profs[S.editProf]; S.editProf = null; }
    queueSave(); renderMine();
  }
  else if (act === "mark-trainer" || act === "clear-prof") {
    const p = ensureMyDoc().chars[S.editChar].profs[S.editProf]; const pi = profIndex(S.editProf);
    if (act === "clear-prof") p.known = [];
    else { const set = new Set(p.known || []); RECIPES.forEach((r) => { if (r.p === pi && isTrainer(r) && r.lv <= (p.skill || 0)) set.add(r.id); }); p.known = [...set]; }
    queueSave(); renderMine();
  }
  else if (act === "reqtab") { S.reqTab = t.dataset.t; renderRequests(); }
  else if (act === "req") {
    t.disabled = true;
    try {
      if (t.dataset.st === "delete") await S.B.deleteRequest(t.dataset.id);
      else await S.B.setRequestStatus(t.dataset.id, t.dataset.st);
      await refresh();
    } catch (err) { note("Couldn't update that request: " + err.message); t.disabled = false; }
  }
  else if (act === "mtype") { S.mtype = t.dataset.t; renderMarket(); }
  else if (act === "unlist") { t.disabled = true; try { await S.B.deleteListing(t.dataset.id); await refresh(); } catch (err) { note("Couldn't remove that listing: " + err.message); t.disabled = false; } }
  else if (act === "deal") {
    const l = S.listings.find((x) => x.id === t.dataset.id); if (!l) return;
    const ch = defaultChar() || ($("#pf-char") && $("#pf-char").value.trim());
    if (!ch) { note("Type your character name in the Character box first, or add it on My crafter."); return; }
    t.disabled = true;
    try {
      await S.B.createRequest({ kind: l.type === "B" ? "sell" : "buy", listingId: l.id, label: l.item, qty: l.qty || 1, tip: (l.price || 0) * (l.qty || 1), note: "", fromChar: ch, to: l.seller, toChar: l.char || "" });
      t.textContent = "Request sent"; refresh();
    } catch (err) { note("Couldn't send the request: " + err.message); t.disabled = false; }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("tr[data-recipe]")) e.target.click();
  if (e.key === "Escape") {
    if (!$("#auth").hidden) { $("#auth").hidden = true; return; }
    if (S.sel && S.view === "recipes") { S.sel = null; S.reqFor = null; renderRecipes(); }
  }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('[type="submit"]');
  if (f.id === "authform") {
    const email = $("#a-email").value.trim(), password = $("#a-pass").value, username = $("#a-user").value.trim();
    const err = $("#a-err"); err.className = "err"; err.textContent = "";
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Enter the email address for your account."; return; }
    if (S.authTab !== "reset" && password.length < 8) { err.textContent = "Passwords need at least 8 characters."; return; }
    if (S.authTab === "up" && !USERNAME_RE.test(username)) { err.textContent = "Usernames use 3–24 letters, numbers or _."; return; }
    btn.disabled = true;
    try {
      if (S.authTab === "in") { await S.B.signIn({ email, password }); $("#auth").hidden = true; }
      else if (S.authTab === "up") {
        const r = await S.B.signUp({ email, password, username });
        if (r.needsConfirm) { err.className = "ok"; err.textContent = "Check your email and click the link to finish creating your account."; }
        else $("#auth").hidden = true;
      } else { await S.B.resetPassword(email); err.className = "ok"; err.textContent = "If that email has an account, a reset link is on its way."; }
      $("#a-pass").value = "";
      await loadMe(); refresh();
    } catch (x) { err.textContent = x.message || "That didn't work. Try again."; }
    btn.disabled = false;
  }
  else if (f.id === "npform") {
    try { await S.B.updatePassword($("#np-pass").value); $("#newpass").hidden = true; note("Password updated."); }
    catch (x) { $("#np-err").textContent = x.message; }
  }
  else if (f.id === "reqform") {
    const ch = $("#rf-char").value.trim(); if (!ch) return;
    lsSet("gc.char", ch); btn.disabled = true;
    try {
      await S.B.createRequest({ kind: "craft", recipeId: S.sel, label: (BYID.get(S.sel) || {}).name || "", qty: Math.max(1, Math.min(999, Number($("#rf-qty").value) || 1)),
        tip: Math.max(0, Number($("#rf-tip").value) || 0), note: $("#rf-note").value.trim().slice(0, 140), fromChar: ch, to: S.reqFor.uid, toChar: S.reqFor.char });
      S.reqFor = null; renderSheet(); note("Request sent. Track it on the Requests tab."); refresh();
    } catch (x) { note("Couldn't send the request: " + x.message); btn.disabled = false; }
  }
  else if (f.id === "addchar") {
    const name = $("#newchar").value.trim().slice(0, 24); if (!name) return;
    const d = ensureMyDoc(); if (!d.chars[name]) d.chars[name] = { profs: {} };
    S.editChar = name; lsSet("gc.editChar", name); if (!lsGet("gc.char")) lsSet("gc.char", name);
    queueSave(); renderMine();
  }
  else if (f.id === "postform") {
    const item = $("#pf-item").value.trim().slice(0, 60), ch = $("#pf-char").value.trim().slice(0, 24);
    if (!item || !ch) return;
    lsSet("gc.char", ch); btn.disabled = true;
    try {
      await S.B.createListing({ char: ch, type: $("#pf-type").value, item, qty: Math.max(1, Number($("#pf-qty").value) || 1), price: Math.max(0, Number($("#pf-price").value) || 0), note: $("#pf-note").value.trim().slice(0, 140) });
      $("#pf-item").value = ""; $("#pf-note").value = ""; $("#pf-price").value = ""; $("#pf-qty").value = "1";
      refresh();
    } catch (x) { note("Couldn't post the listing: " + x.message); }
    btn.disabled = false;
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches("[data-known]")) {
    const p = ensureMyDoc().chars[S.editChar].profs[S.editProf]; const id = Number(t.dataset.known);
    const set = new Set(p.known || []); t.checked ? set.add(id) : set.delete(id); p.known = [...set];
    queueSave();
    const chip = document.querySelector('[data-act="pick-prof"][aria-pressed="true"] .n'); if (chip) chip.textContent = set.size;
  }
  else if (t.id === "addprof" && t.value) {
    const c = ensureMyDoc().chars[S.editChar]; c.profs = c.profs || {}; c.profs[t.value] = { skill: 1, known: [] };
    S.editProf = t.value; queueSave(); renderMine();
  }
  else if (t.id === "skill") { const p = ensureMyDoc().chars[S.editChar].profs[S.editProf]; p.skill = Math.max(1, Math.min(300, Number(t.value) || 1)); queueSave(); }
  else if (t.id === "mynote") { ensureMyDoc().note = t.value.slice(0, 200); queueSave(); }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "mineq") { S.mineQ = e.target.value; S._focusMine = true; renderMine(); S._focusMine = false; }
});

route();
})();
