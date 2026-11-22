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
// Guild settings. Paste the guild's Discord invite (e.g. "https://discord.gg/abc123") to show a Join button on the front page.
const GUILD = { discordInvite: "" };
const SRC = { 1: "Crafted", 2: "World drop", 4: "Quest", 5: "Vendor", 6: "Trainer", 16: "Fishing", 21: "Pickpocket" };
const FINISHED = new Set(["done", "declined", "cancelled"]);

/* ---------- state ---------- */
const S = {
  view: "recipes", q: "", prof: -1, hasCrafter: false, onlyNew: false, limit: 150, sel: null, reqFor: null,
  B: null, me: null, uid: null, loaded: false,
  crafters: new Map(), requests: [], listings: [], profiles: {}, bnet: {}, board: [], messages: [], online: [], chatOpen: new Set(), onlineOpen: false,
  boardTab: "open", boardCat: "", viewUser: null, notifOpen: false, seenOverride: 0, postOpen: false,
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
  S.B.discordEnabled().then((on) => { $("#discord-wrap").hidden = !on; });
  if (GUILD.discordInvite) { const a = $("#home-actions"); if (a) a.dataset.discord = GUILD.discordInvite; }
  S.B.onChange(() => queueRefresh());
  S.B.onAuthChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") $("#newpass").hidden = false;
    await loadMe(); queueRefresh(true);
  });
  await loadMe();
  await refresh();
  // Coming back from Battle.net: say how it went, then tidy the address bar.
  const bnetResult = new URLSearchParams(location.search).get("bnet");
  if (bnetResult) {
    // The Battle.net details come back through sessionStorage; save them under this member's own sign-in.
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("gc.bnet") || "null"); sessionStorage.removeItem("gc.bnet"); } catch {}
    if (saved && S.uid) {
      try { await S.B.saveBnet(saved); await refresh(); }
      catch (e) { note("Battle.net details came back but couldn't be saved: " + e.message); history.replaceState(null, "", location.pathname + "#mine"); return; }
    }
    const msgs = {
      linked: "Battle.net linked. Your characters are listed on My crafter; add the ones you craft on.",
      "linked-nochars": "Battle.net linked. Blizzard didn't list any WoW Forever characters for this account, so add your characters by hand.",
      cancelled: "Battle.net linking was cancelled.",
      expired: "That Battle.net link attempt expired. Try again.",
      off: "Battle.net linking isn't switched on yet.",
      failed: "Battle.net linking didn't work. Try again in a moment.",
    };
    note(msgs[bnetResult] || msgs.failed);
    history.replaceState(null, "", location.pathname + (location.hash || "#mine"));
  }
  setInterval(() => { if (S.uid && document.visibilityState === "visible") refresh(); }, 60000);
})();

async function loadMe() {
  try { S.me = await S.B.currentUser(); } catch { S.me = null; }
  if ((S.me && S.me.id) !== S.uid) { S.myDoc = null; S.crafters = new Map(); S.requests = []; S.listings = []; }
  S.uid = S.me ? S.me.id : null;
  if (!S.uid && S.presenceKey) { S.B.leavePresence(); S.presenceKey = null; S.online = []; }
  renderWho();
}
function renderWho() {
  $("#who").innerHTML = S.me
    ? `<a class="me-link" href="#profile" title="Your profile">${avatarImg(S.uid, 26)}<span>${esc(S.me.username)}</span></a><button class="btn small" data-act="signout">Sign out</button>`
    : `<button class="btn small primary" data-act="signin">Sign in</button>`;
}
// Tell the guild who's here (and on which page), once profile details are loaded.
function presenceInfo() { const p = prof(S.uid); return { username: S.me ? S.me.username : "", char: p.mainChar || defaultChar() || "", cls: p.mainClass || "", avatar: p.avatar || "", page: S.view }; }
function syncPresence() {
  if (!S.uid || !S.B) return;
  if (S.presenceKey !== S.uid) {
    S.presenceKey = S.uid;
    S.B.joinPresence({ id: S.uid, ...presenceInfo() }, (list) => { S.online = list; renderOnline(); });
  } else S.B.updatePresence({ id: S.uid, ...presenceInfo() });
}

let refreshTimer = null;
function queueRefresh(now) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, now ? 0 : 400); }
async function refresh() {
  if (!S.uid) { S.loaded = true; buildIndex(); render(); return; }
  try {
    const d = await S.B.loadAll();
    S.profiles = d.profiles; S.bnet = d.bnet || {}; S.board = d.board || []; S.messages = d.messages || [];
    S.crafters = new Map(d.crafters.map((c) => [c.uid, c]));
    S.requests = d.requests; S.listings = d.listings;
    if (!S.pendingSave) { const mine = S.crafters.get(S.uid); S.myDoc = mine ? structuredClone({ chars: mine.chars, note: mine.note }) : (S.myDoc || null); }
    if (S.presenceKey !== S.uid) { syncPresence(); renderWho(); }
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
  const VIEWS = ["home", "rules", "map", "board", "recipes", "mine", "requests", "market", "profile"];
  let view = "home";
  S.viewUser = null; S.notifOpen = false; S.onlineOpen = false;
  if (/^recipe-\d+$/.test(h)) { S.sel = Number(h.slice(7)); view = "recipes"; }
  else if (/^member-[0-9a-z_-]+$/i.test(h)) { S.viewUser = h.slice(7); view = "profile"; }
  else if (/^rule-\d$|^consequences$/.test(h)) view = "rules";
  else if (VIEWS.includes(h)) view = h;
  const changed = S.view !== view;
  S.view = view;
  document.querySelectorAll("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === view ? "page" : "false"));
  VIEWS.forEach((v) => ($("#view-" + v).hidden = v !== view));
  if (view === "rules" && h !== "rules") { const el = document.getElementById(h); if (el) el.scrollIntoView(); }
  else if (changed) window.scrollTo(0, 0);
  if (changed && S.presenceKey) syncPresence();
  render();
}
window.addEventListener("hashchange", route);

function render() {
  if (renderQueued) return; renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    renderHome();
    if (!DATA_OK) { $("#view-recipes").innerHTML = `<div class="empty"><strong>Loading 2,215 recipes…</strong></div>`; return; }
    const open = S.requests.filter((r) => r.to === S.uid && r.status === "pending").length;
    const b = $("#req-badge"); b.textContent = open; b.hidden = !open;
    const a = document.activeElement;
    // A half-typed chat message survives redraws (new messages still appear); other forms pause redraws while typing.
    const chatForm = a && a.closest && a.closest(".chat-form");
    const chatState = chatForm ? { key: chatForm.dataset.key, value: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
    const typing = !chatForm && a && a.matches && a.matches("input[type=text],input[type=number],input[type=password],textarea") ? a : null;
    if (chatState) setTimeout(() => {
      const box = document.querySelector(`.chat-form[data-key="${chatState.key}"] input`);
      if (box && document.activeElement !== box) { box.value = chatState.value; box.focus(); try { box.setSelectionRange(chatState.s, chatState.e); } catch {} }
    }, 0);
    renderBell(); renderOnline();
    if (S.view === "map") { if (window.GC_MAP) window.GC_MAP.render(); }
    else if (S.view === "board") { if (!(typing && typing.closest("#view-board"))) { renderBoard(); scrollChats(); } }
    else if (S.view === "profile") { if (!(typing && typing.closest("#view-profile"))) renderProfile(); }
    else if (S.view === "recipes") renderRecipes();
    else if (S.view === "mine") { if (!(typing && typing.closest("#view-mine"))) renderMine(); }
    else if (S.view === "requests") { if (!(typing && typing.closest("#view-requests"))) { renderRequests(); scrollChats(); } }
    else renderMarket();
  }, 0);
}
/* ---------- Hooks for the map page (map.js) ---------- */
let ITEM_INDEX = null;
window.GC_ITEMS = () => {
  if (!DATA_OK) return null;
  if (!ITEM_INDEX) {
    const uses = {};
    RECIPES.forEach((r) => r.mats.forEach(([id]) => { uses[id] = (uses[id] || 0) + 1; }));
    const byName = {};
    for (const [id, v] of Object.entries(ITEMS)) if (uses[id]) byName[v[0].toLowerCase()] = { name: v[0], uses: uses[id] };
    ITEM_INDEX = { byName };
  }
  return ITEM_INDEX;
};
window.GC_SEARCH_RECIPES = (name) => {
  S.q = name; S.prof = -1; S.limit = 150; S.sel = null;
  location.hash = "#recipes";
  setTimeout(() => { const box = $("#rq"); if (box) { box.value = name; renderRecipes(); } }, 0);
};

/* ---------- Home ---------- */
function renderHome() {
  const act = $("#home-actions"); if (!act) return;
  const discord = /^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(GUILD.discordInvite) ? `<a class="btn discord" href="${esc(GUILD.discordInvite)}" target="_blank" rel="noopener">Join our Discord</a>` : "";
  act.innerHTML = `<a class="btn primary" href="#rules">Read the guild rules</a>` + discord + (S.uid
    ? `<a class="btn" href="#mine">Go to my crafter</a>`
    : `<button class="btn" data-act="signup">Create your account</button><button class="btn" data-act="signin">Sign in</button>`);
  const st = $("#home-stats");
  if (!S.uid) { st.innerHTML = ""; return; }
  const crafters = [...S.crafters.values()].filter((c) => Object.keys(c.chars || {}).length).length;
  let known = 0; INDEX.forEach(() => known++);
  const listings = S.listings.length;
  const open = S.requests.filter((r) => r.to === S.uid && r.status === "pending").length;
  const stat = (n, label) => `<div><span class="num">${fmt(n)}</span><span>${label}</span></div>`;
  st.innerHTML = stat(crafters, crafters === 1 ? "crafter listed" : "crafters listed") + stat(known, "recipes covered")
    + stat(listings, listings === 1 ? "market listing" : "market listings") + stat(open, open === 1 ? "request for you" : "requests for you");
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
      <div class="rl">${un ? memberLink(x.uid, un) + " · " : ""}${tagFor(x.uid) ? `<span class="bnet-tag small" title="Verified Battle.net account">✓ ${esc(tagFor(x.uid))}</span> · ` : ""}${esc(x.prof)} ${x.skill || ""}</div>${x.note ? `<div class="note">${esc(x.note)}</div>` : ""}</div>
      ${mine ? "" : `<button class="btn small primary" data-act="ask" data-i="${i}">Request</button>`}</div>
      ${S.reqFor && S.reqFor.uid === x.uid && S.reqFor.char === x.char ? requestForm() : ""}`;
  }).join("");
  el.innerHTML = `
    <div class="head">
      <div><h2 class="q${r.q}">${esc(r.name)}</h2>
      <div class="sub">${esc(profName(r.p))} · learned at ${r.lv} · ${esc(src)}${r.isNew ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
      <button class="btn small close" data-act="close-sheet" aria-label="Close">Close</button>
    </div>
    <p class="muted" style="margin:10px 0 0">${r.cr ? `Creates ${whItem(r.cr)}${r.cmax > 1 ? ` ×${r.cmin === r.cmax ? r.cmin : r.cmin + "–" + r.cmax}` : ""}` : creates}</p>

    <details class="dd" open><summary>Materials and where to get them</summary>
      <ul class="mats">${r.mats.map((m) => {
        const g = window.GC_MAP && window.GC_MAP.findItem(itemName(m[0]));
        return `<li><span>${whItem(m[0])}${g ? ` <button class="linkish where" data-act="mapfind" data-mapfind="${esc(g.key)}">gathered in ${g.zones} zone${g.zones === 1 ? "" : "s"}</button>` : ""}</span><span class="num muted">×${m[1]}</span></li>`;
      }).join("")}</ul>
      <p class="muted dd-note">Hover a material for its Wowhead details.</p>
    </details>

    <details class="dd"><summary>How to learn it</summary>
      <p>Learned at skill <strong>${r.lv}</strong> from: ${esc(src)}.</p>
      <div class="ranks" aria-label="Skill-up ranks">
        <div style="border-color:var(--sk-o)">${c[0]}</div><div style="border-color:var(--sk-y)">${c[1]}</div>
        <div style="border-color:var(--sk-g)">${c[2]}</div><div style="border-color:var(--sk-x)">${c[3]}</div>
      </div>
      <p class="muted dd-note">Skill-ups are guaranteed up to the orange number, likely to yellow, unlikely to green, and stop at grey.</p>
      <p><a href="https://www.wowhead.com/forever/spell=${r.id}" target="_blank" rel="noopener">Recipe, trainers and vendors on Wowhead</a></p>
    </details>

    ${r.cr ? `<details class="dd"><summary>About the crafted item</summary>
      <p>${whItem(r.cr)}${r.cmax > 1 ? ` · makes ${r.cmin === r.cmax ? r.cmin : r.cmin + "–" + r.cmax} per craft` : ""}</p>
      <p class="muted dd-note">Hover the item for its full stats, or open it on Wowhead for drops, comments and screenshots.</p>
      <p><a href="https://www.wowhead.com/forever/item=${r.cr}" target="_blank" rel="noopener">${esc(itemName(r.cr))} on Wowhead</a></p>
    </details>` : ""}

    <h3>Guild crafters${S.uid ? ` (${crafters.length})` : ""}</h3>
    <div>${who}</div>`;
  el._crafters = crafters;
  refreshWowhead();
  if (window.GC_MAP && !window.GC_MAP.ready()) window.GC_MAP.load().then(() => { if (S.sel === r.id) renderSheet(); });
}
// A Wowhead item link: hover shows Wowhead's tooltip (icon, stats, where it drops).
function whItem(id) { return `<a class="wh q${itemQ(id)}" href="https://www.wowhead.com/forever/item=${id}" target="_blank" rel="noopener">${esc(itemName(id))}</a>`; }
function refreshWowhead() { try { if (window.$WowheadPower && window.$WowheadPower.refreshLinks) window.$WowheadPower.refreshLinks(); } catch {} }
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
      ${bnetCard()}
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

function bnetCard() {
  const link = S.bnet[S.uid];
  if (!link) {
    const onNetlify = /netlify\.app$/.test(location.hostname) || location.hostname === "localhost";
    return `<h3>Battle.net</h3>
      <p class="muted" style="margin:0 0 8px">Link your Battle.net account so guildmates see your verified BattleTag, and import your characters.</p>
      ${onNetlify ? `<button class="btn primary" data-act="link-bnet">Link Battle.net account</button>`
        : `<a class="btn primary" href="https://guildcraft-hall.netlify.app/#mine">Link on guildcraft-hall.netlify.app</a>`}`;
  }
  const mine = new Set(myChars().map((c) => c.toLowerCase()));
  const chars = link.characters || [];
  return `<h3>Battle.net</h3>
    <div class="inline" style="justify-content:space-between"><span class="bnet-tag">✓ ${esc(link.battletag || "Linked")}</span><button class="btn small danger" data-act="unlink-bnet">Unlink</button></div>
    ${chars.length ? `<div class="bnet-chars">${chars.slice(0, 30).map((c, i) => `
      <div class="bnet-char"><div><strong>${esc(c.name)}</strong> <span class="muted">${esc(c.realm || "")}</span>
        <div class="muted" style="font-size:.78rem">${c.level ? "Level " + c.level + " " : ""}${esc(c.cls || "")}${c.game ? " · " + esc(c.game) : ""}</div></div>
        ${mine.has(String(c.name).toLowerCase()) ? '<span class="muted" style="font-size:.8rem">Added</span>' : `<button class="btn small" data-act="import-char" data-i="${i}">Add</button>`}</div>`).join("")}</div>`
      : `<p class="muted" style="margin:6px 0 0;font-size:.84rem">Blizzard didn't list any characters for this account. Add your WoW Forever characters by hand above.</p>`}`;
}
const tagFor = (uid) => (S.bnet[uid] && S.bnet[uid].battletag) || "";

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
        <div class="meta">${dir === "in" ? "From" : "To"} <strong>${esc(otherChar || "?")}</strong>${un ? ` (${esc(un)}${tagFor(other) ? " · " + esc(tagFor(other)) : ""})` : ""}${dir === "out" && r.fromChar ? ` · for ${esc(r.fromChar)}` : ""}${dir === "in" && r.toChar ? ` · to ${esc(r.toChar)}` : ""} · ${ago(r.created)} · ${r.kind === "craft" ? "Tip" : "Price"} ${gold(r.tip)}</div>
        ${r.note ? `<div class="meta">“${esc(r.note)}”</div>` : ""}${mats}</div>
      <div class="acts"><span class="pill st-${esc(r.status)}">${esc(r.status)}</span>${chatToggle("request", r.id)}${acts.map((a) => `<button class="btn small ${a[2]}" data-act="req" data-id="${esc(r.id)}" data-st="${a[0]}">${a[1]}</button>`).join("")}</div>
      ${chatBox("request", r.id) ? `<div class="req-chat">${chatBox("request", r.id)}</div>` : ""}
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

/* ---------- Members & profiles ---------- */
const CLASSES = ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"];
const CLASS_COLOR = { Druid: "#FF7C0A", Hunter: "#AAD372", Mage: "#3FC7EB", Paladin: "#F48CBA", Priest: "#E8E8E8", Rogue: "#FFF468", Shaman: "#0070DD", Warlock: "#8788EE", Warrior: "#C69B6D" };
const prof = (uid) => S.profiles[uid] || {};
const classDot = (c) => (CLASS_COLOR[c] ? `<span class="cdot" style="background:${CLASS_COLOR[c]}" title="${esc(c)}"></span>` : "");
const memberLink = (uid, label) => `<a class="mlink" href="#member-${esc(uid)}">${esc(label || userName(uid) || "Someone")}</a>`;
function profsOf(uid) {
  const out = [];
  const doc = S.crafters.get(uid);
  for (const [char, c] of Object.entries((doc && doc.chars) || {}))
    for (const [p, v] of Object.entries(c.profs || {})) out.push({ char, prof: p, skill: v.skill || 0, known: (v.known || []).length });
  return out;
}

// Profile picture, or the first letter on a class-coloured circle.
function avatarImg(uid, size) {
  const p = (S.profiles && S.profiles[uid]) || {};
  const url = /^https:\/\/|^data:image\//.test(p.avatar || "") ? p.avatar : "";
  const letter = esc(((p.mainChar || p.username || (uid === S.uid && S.me && S.me.username) || "?")[0] || "?").toUpperCase());
  const bg = CLASS_COLOR[p.mainClass] || "var(--brass)";
  return url ? `<img class="avatar" src="${esc(url)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy">`
    : `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px;background:${bg}">${letter}</span>`;
}

/* ---------- Chat threads (on requests and board posts) ---------- */
const threadMsgs = (type, id) => S.messages.filter((m) => m.type === type && m.thread === String(id));
function threadUnread(type, id) { const seen = seenAt(); return threadMsgs(type, id).filter((m) => m.author !== S.uid && m.t > seen).length; }
function chatToggle(type, id) {
  const n = threadMsgs(type, id).length, u = threadUnread(type, id), key = type + ":" + id;
  return `<button class="btn small chat-btn" data-act="chat" data-key="${key}" aria-expanded="${S.chatOpen.has(key)}">Chat${n ? ` (${n})` : ""}${u ? ' <span class="badge">' + u + "</span>" : ""}</button>`;
}
function chatBox(type, id) {
  const key = type + ":" + id;
  if (!S.chatOpen.has(key)) return "";
  const msgs = threadMsgs(type, id);
  return `<div class="chat">
    <div class="chat-log" aria-live="polite">${msgs.map((m) => `<div class="msg ${m.author === S.uid ? "me" : ""}">${avatarImg(m.author, 26)}
      <div class="msg-b"><div class="msg-meta"><strong>${esc(userName(m.author) || "Someone")}</strong> · ${ago(m.t)}${m.author === S.uid || (S.me && S.me.isAdmin) ? ` <button class="linkish small-x" data-act="msg-del" data-id="${esc(m.id)}" aria-label="Delete message">delete</button>` : ""}</div>
      <div class="msg-body">${esc(m.body)}</div></div></div>`).join("") || `<p class="muted chat-empty">No messages yet. Say hi, or sort out the details here.</p>`}</div>
    <form class="chat-form" data-key="${key}"><input type="text" maxlength="500" placeholder="Write a message…" aria-label="Message" autocomplete="off"><button class="btn small primary" type="submit">Send</button></form>
  </div>`;
}
function scrollChats() { document.querySelectorAll(".chat-log").forEach((el) => { el.scrollTop = el.scrollHeight; }); }

/* ---------- Who's online ---------- */
const PAGE_NAMES = { home: "Home", rules: "Rules", map: "the map", board: "the Request Board", recipes: "Recipes", mine: "My crafter", requests: "Requests", market: "the Market", profile: "profiles" };
function renderOnline() {
  const btn = $("#online-btn"); if (!btn) return;
  const list = S.uid ? S.online.slice().sort((a, b) => (a.id === S.uid ? -1 : b.id === S.uid ? 1 : (a.username || "").localeCompare(b.username || ""))) : [];
  btn.hidden = !S.uid;
  $("#online-count").textContent = list.length;
  const row = (o) => `<li><a href="#member-${esc(o.id)}">${avatarImg(o.id, 28)}<span><strong>${esc(o.char || o.username || "Someone")}</strong>${o.id === S.uid ? " (you)" : ""}<small>${o.username && o.char ? esc(o.username) + " · " : ""}on ${esc(PAGE_NAMES[o.page] || "the site")}</small></span></a></li>`;
  const panel = $("#online-panel");
  panel.hidden = !S.onlineOpen;
  if (S.onlineOpen) panel.innerHTML = `<div class="np-head"><strong>Online now (${list.length})</strong></div><ul class="online-list">${list.map(row).join("")}</ul>`;
  const home = $("#home-online");
  if (home) home.innerHTML = S.uid && list.length ? `<h3 class="sec">Online now <span class="online-dot"></span> ${list.length}</h3><ul class="online-list inline">${list.slice(0, 12).map(row).join("")}</ul>` : "";
}

function memberCard(uid, big) {
  const p = prof(uid), tag = tagFor(uid);
  const main = p.mainChar ? `${classDot(p.mainClass)}<strong>${esc(p.mainChar)}</strong>${p.mainLevel ? ` <span class="muted">${p.mainLevel}</span>` : ""}${p.mainClass ? ` <span class="muted">${esc(p.mainClass)}</span>` : ""}${p.mainRealm ? ` <span class="muted">· ${esc(p.mainRealm)}</span>` : ""}` : `<span class="muted">No main character set</span>`;
  const profs = profsOf(uid);
  return `<div class="member ${big ? "big" : ""}">
    ${avatarImg(uid, big ? 56 : 40)}
    <div class="minfo">
      <div class="mname">${big ? esc(p.username || "Member") : memberLink(uid, p.username)}${p.faction ? ` <span class="tag ${p.faction === "Horde" ? "horde" : "ally"}">${esc(p.faction)}</span>` : ""}${tag ? ` <span class="bnet-tag small">✓ ${esc(tag)}</span>` : ""}</div>
      <div class="mmain">${main}</div>
      ${profs.length ? `<div class="mprofs">${profs.map((x) => `<span class="pchip">${esc(x.prof)}${x.skill ? " " + x.skill : ""}</span>`).join("")}</div>` : ""}
    </div></div>`;
}

function renderProfile() {
  const root = $("#view-profile");
  if (!S.uid) { root.innerHTML = signInPrompt("see member profiles"); return; }
  const uid = S.viewUser || S.uid;
  const mine = uid === S.uid;
  const p = prof(uid);
  if (!S.profiles[uid]) { root.innerHTML = `<div class="card empty"><strong>That member wasn't found.</strong><a href="#profile">Back to your profile</a></div>`; return; }

  const posts = S.board.filter((b) => b.author === uid && b.status === "open");
  const others = Object.keys(S.profiles).filter((id) => id !== uid)
    .sort((a, b) => (userName(a) || "").localeCompare(userName(b) || ""));
  const details = `
    <div class="card">
      ${memberCard(uid, true)}
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
      <dl class="pfacts">
        ${p.discord ? `<div><dt>Discord</dt><dd>${esc(p.discord)}</dd></div>` : ""}
        ${p.playTimes ? `<div><dt>Usually on</dt><dd>${esc(p.playTimes)}</dd></div>` : ""}
        ${p.joined ? `<div><dt>Joined the hall</dt><dd>${new Date(p.joined).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</dd></div>` : ""}
      </dl>
      ${!mine && posts.length ? `<h3>Open requests on the board</h3><ul class="mats">${posts.map((b) => `<li><a href="#board">${esc(b.title)}</a><span class="muted num">×${b.qty}</span></li>`).join("")}</ul>` : ""}
    </div>`;

  let editor = "";
  if (mine) {
    const chars = ((S.bnet[S.uid] || {}).characters) || [];
    editor = `
    <div class="card">
      <h2>Edit your profile</h2>
      <div class="avatar-edit">${avatarImg(S.uid, 72)}
        <div><label class="btn small" for="pr-avatar">Choose a picture</label><input type="file" id="pr-avatar" accept="image/jpeg,image/png,image/webp" class="visually-hidden">
          ${p.avatar ? `<button class="btn small danger" type="button" data-act="avatar-remove">Remove</button>` : ""}
          <p class="saved" id="pr-avatar-msg">Square works best. It's shrunk to 256 × 256.</p></div></div>
      ${chars.length ? `<div class="fillrow"><label class="muted" for="pf-fill">Fill from your WoW character</label>
        <select id="pf-fill"><option value="">Choose a character…</option>${chars.map((c, i) => `<option value="${i}">${esc(c.name)} · ${c.level || "?"} ${esc(c.cls || "")}${c.realm ? " · " + esc(c.realm) : ""}${c.game ? " (" + esc(c.game) + ")" : ""}</option>`).join("")}</select></div>`
      : `<p class="muted" style="margin:0 0 10px">Link your Battle.net account on <a href="#mine">My crafter</a> to fill this in from your WoW character.</p>`}
      <form class="form" id="profform" style="margin:0">
        <div class="row"><label for="pr-char">Main character</label><input type="text" id="pr-char" maxlength="24" value="${esc(p.mainChar || "")}"></div>
        <div class="row"><label for="pr-realm">Realm</label><input type="text" id="pr-realm" maxlength="40" value="${esc(p.mainRealm || "")}"></div>
        <div class="row"><label for="pr-class">Class</label><select id="pr-class"><option value="">—</option>${CLASSES.map((c) => `<option ${p.mainClass === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="row"><label for="pr-level">Level</label><input type="number" id="pr-level" min="0" max="80" value="${p.mainLevel || ""}"></div>
        <div class="row"><label for="pr-faction">Faction</label><select id="pr-faction"><option value="">—</option>${["Alliance", "Horde"].map((f) => `<option ${p.faction === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
        <div class="row"><label for="pr-discord">Discord name</label><input type="text" id="pr-discord" maxlength="40" value="${esc(p.discord || "")}"></div>
        <div class="row"><label for="pr-times">Usually on</label><input type="text" id="pr-times" maxlength="80" value="${esc(p.playTimes || "")}" placeholder="e.g. Weeknights 7–10pm AEST"></div>
        <div class="row"><label for="pr-bio">About you</label><textarea id="pr-bio" rows="3" maxlength="400">${esc(p.bio || "")}</textarea></div>
        <div class="actions"><span class="saved" id="pr-saved"></span><button class="btn primary" type="submit">Save profile</button></div>
      </form>
    </div>`;
  }
  root.innerHTML = `
    <div class="map-head"><p class="eyebrow">Bark and Stone · Members</p><h2 class="hero-title">${mine ? "Your profile" : esc(p.username || "Member")}</h2></div>
    <div class="cols prof-cols">${details}${editor || `<div class="card"><h2>Ask them for something</h2><p class="muted">Find a recipe they know on <a href="#recipes">Recipes</a> and press Request, or post on the <a href="#board">Request Board</a> for anyone to pick up.</p></div>`}</div>
    <h3 class="sec" style="margin-top:22px">Guild members (${Object.keys(S.profiles).length})</h3>
    <div class="members">${(mine ? others : [S.uid, ...others.filter((x) => x !== S.uid)]).map((id) => memberCard(id)).join("") || '<p class="muted">You\'re the first one here.</p>'}</div>`;
}

/* ---------- Public request board ---------- */
const CATS = { craft: "Craft", item: "Find an item", gather: "Gather", help: "Help" };
function renderBoard() {
  const root = $("#view-board");
  if (!S.uid) { root.innerHTML = signInPrompt("use the Request Board"); return; }
  const tabs = [["open", "Open"], ["claimed", "Taken"], ["done", "Done"], ["mine", "Mine"]];
  const list = S.board.filter((b) => {
    if (S.boardCat && b.category !== S.boardCat) return false;
    if (S.boardTab === "mine") return b.author === S.uid || b.claimer === S.uid;
    return b.status === S.boardTab;
  }).sort((a, b) => b.created - a.created);
  const counts = { open: S.board.filter((b) => b.status === "open").length, claimed: S.board.filter((b) => b.status === "claimed").length };
  const recipeNames = DATA_OK ? [...new Set(RECIPES.map((r) => r.name))].sort() : [];

  const card = (b) => {
    const rec = b.recipeId && BYID.get(b.recipeId);
    const crafters = rec ? (INDEX.get(rec.id) || []) : [];
    const canMake = crafters.some((c) => c.uid === S.uid);
    const mine = b.author === S.uid, took = b.claimer === S.uid, admin = S.me && S.me.isAdmin;
    let acts = [];
    if (b.status === "open" && !mine) acts.push(["claim", "I'll do it", "primary"]);
    if (b.status === "claimed" && took) acts.push(["done", "Mark done", "primary"], ["release", "Give it back", ""]);
    if (mine && b.status === "open") acts.push(["cancel", "Cancel", ""]);
    if (mine && b.status === "claimed") acts.push(["done", "Mark done", "primary"], ["reopen", "Reopen", ""]);
    if ((mine || admin) && (b.status === "done" || b.status === "cancelled")) acts.push(["delete", "Remove", "danger"]);
    if (admin && !mine && b.status !== "done" && b.status !== "cancelled") acts.push(["delete", "Remove", "danger"]);
    const statusLabel = { open: "open", claimed: "taken", done: "done", cancelled: "cancelled" }[b.status];
    return `<article class="post ${b.status}">
      <div class="post-main">
        <div class="post-top"><span class="tag cat-${esc(b.category)}">${esc(CATS[b.category] || b.category)}</span><span class="pill st-${b.status === "claimed" ? "accepted" : b.status === "open" ? "pending" : esc(b.status)}">${statusLabel}</span>${canMake && b.status === "open" ? '<span class="tag can">You can craft this</span>' : ""}</div>
        <h3 class="post-title">${rec ? `<a class="q${rec.q}" href="#recipe-${rec.id}">${esc(b.title)}</a>` : esc(b.title)} <span class="num muted">×${b.qty}</span></h3>
        ${b.note ? `<p class="post-note">${esc(b.note)}</p>` : ""}
        <div class="meta">Posted by <strong>${esc(b.authorChar || "?")}</strong> (${memberLink(b.author)}) · ${ago(b.created)} · Offer ${gold(b.offer)}${rec ? ` · ${crafters.length} guild crafter${crafters.length === 1 ? "" : "s"} know this` : ""}</div>
        ${b.claimer ? `<div class="meta">${b.status === "done" ? "Done by" : "Taken by"} <strong>${esc(b.claimerChar || "?")}</strong> (${memberLink(b.claimer)})${b.claimed ? " · " + ago(b.claimed) : ""}</div>` : ""}
      </div>
      <div class="acts">${chatToggle("board", b.id)}${acts.map((a) => `<button class="btn small ${a[2]}" data-act="post" data-op="${a[0]}" data-id="${esc(b.id)}">${a[1]}</button>`).join("")}</div>
      ${chatBox("board", b.id) ? `<div class="req-chat">${chatBox("board", b.id)}</div>` : ""}
    </article>`;
  };

  root.innerHTML = `
    <div class="map-head board-head"><div><p class="eyebrow">Bark and Stone · Request Board</p><h2 class="hero-title">Request Board</h2>
      <p class="muted map-intro">Post what you need and anyone in the guild can take the job. Crafts, items, materials or a hand with something.</p></div>
      <button class="btn primary" data-act="post-toggle">${S.postOpen ? "Close" : "Post a request"}</button></div>
    ${S.postOpen ? `<form class="form postform" id="boardform">
      <div class="row"><label for="bf-cat">What kind</label><select id="bf-cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="row"><label for="bf-title">What you need</label><input type="text" id="bf-title" list="recipelist" maxlength="80" required placeholder="e.g. Elixir of Lion's Strength, 10 Copper Bars, help with a quest"></div>
      <div class="row"><label for="bf-qty">Quantity</label><input type="number" id="bf-qty" min="1" max="9999" value="1"></div>
      <div class="row"><label for="bf-offer">Offer (gold)</label><input type="number" id="bf-offer" min="0" step="0.01" placeholder="0"></div>
      <div class="row"><label for="bf-char">Your character</label><input type="text" id="bf-char" maxlength="24" value="${esc(defaultChar() || prof(S.uid).mainChar || "")}" required></div>
      <div class="row"><label for="bf-note">Details</label><textarea id="bf-note" rows="2" maxlength="300" placeholder="I'll bring the mats, need it by Friday raid, etc."></textarea></div>
      <div class="actions"><button class="btn primary" type="submit">Post to the board</button></div>
      <datalist id="recipelist">${recipeNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    </form>` : ""}
    <div class="filters">
      <div class="chips">${tabs.map(([k, l]) => `<button class="chip" data-act="board-tab" data-t="${k}" aria-pressed="${S.boardTab === k}">${l}${counts[k] != null ? `<span class="n">${counts[k]}</span>` : ""}</button>`).join("")}</div>
      <div class="chips"><button class="chip" data-act="board-cat" data-c="" aria-pressed="${!S.boardCat}">All kinds</button>${Object.entries(CATS).map(([k, v]) => `<button class="chip" data-act="board-cat" data-c="${k}" aria-pressed="${S.boardCat === k}">${v}</button>`).join("")}</div>
    </div>
    <div class="posts">${list.map(card).join("") || `<div class="card empty"><strong>${S.boardTab === "open" ? "No open requests right now." : "Nothing here yet."}</strong>${S.boardTab === "open" ? "Post one, and the whole guild will see it." : ""}</div>`}</div>`;
}

/* ---------- Notifications ---------- */
function seenAt() { return Math.max(S.seenOverride, (prof(S.uid).notifSeen) || 0); }
function notifications() {
  if (!S.uid) return [];
  const out = [];
  const label = (r) => (r.kind === "craft" && BYID.get(r.recipeId) ? BYID.get(r.recipeId).name : r.label || "an item");
  for (const r of S.requests) {
    if (r.to === S.uid && r.status === "pending") out.push({ t: r.created, text: `<strong>${esc(r.fromChar || userName(r.from))}</strong> asked you for ${esc(label(r))} ×${r.qty}`, href: "#requests" });
    if (r.to === S.uid && r.status === "cancelled") out.push({ t: r.updated || r.created, text: `<strong>${esc(r.fromChar || userName(r.from))}</strong> cancelled their request for ${esc(label(r))}`, href: "#requests" });
    if (r.from === S.uid && r.status !== "pending" && r.status !== "cancelled") out.push({ t: r.updated || r.created, text: `<strong>${esc(r.toChar || userName(r.to))}</strong> marked your request for ${esc(label(r))} as ${esc(r.status)}`, href: "#requests" });
  }
  for (const b of S.board) {
    if (b.author === S.uid && b.claimer && b.claimer !== S.uid && (b.status === "claimed" || b.status === "done"))
      out.push({ t: b.updated, text: `<strong>${esc(b.claimerChar || userName(b.claimer))}</strong> ${b.status === "done" ? "finished" : "took"} your board request: ${esc(b.title)}`, href: "#board" });
    if (b.author !== S.uid && b.status === "open")
      out.push({ t: b.created, text: `New on the board from <strong>${esc(b.authorChar || userName(b.author))}</strong>: ${esc(b.title)}`, href: "#board" });
    if (b.author !== S.uid && b.claimer === S.uid && b.status === "cancelled")
      out.push({ t: b.updated, text: `A job you took was cancelled: ${esc(b.title)}`, href: "#board" });
  }
  // Chat messages from others in threads I'm part of (my requests, and board posts I posted, took or wrote in).
  const mineBoard = new Set(S.board.filter((b) => b.author === S.uid || b.claimer === S.uid).map((b) => b.id));
  S.messages.forEach((m) => { if (m.type === "board" && m.author === S.uid) mineBoard.add(m.thread); });
  for (const m of S.messages) {
    if (m.author === S.uid) continue;
    if (m.type === "request") { const r = S.requests.find((x) => x.id === m.thread); if (r) out.push({ t: m.t, text: `<strong>${esc(userName(m.author))}</strong> messaged you about ${esc(label(r))}: “${esc(m.body.slice(0, 60))}”`, href: "#requests" }); }
    else if (mineBoard.has(m.thread)) { const b = S.board.find((x) => x.id === m.thread); if (b) out.push({ t: m.t, text: `<strong>${esc(userName(m.author))}</strong> on “${esc(b.title)}”: “${esc(m.body.slice(0, 60))}”`, href: "#board" }); }
  }
  const seen = seenAt();
  return out.filter((n) => n.t).sort((a, b) => b.t - a.t).slice(0, 40).map((n) => ({ ...n, unread: n.t > seen }));
}
function renderBell() {
  const bell = $("#bell"); if (!bell) return;
  bell.hidden = !S.uid;
  if (!S.uid) { $("#notif-panel").hidden = true; return; }
  const list = notifications();
  const unread = list.filter((n) => n.unread).length;
  const badge = $("#bell-count"); badge.textContent = unread > 9 ? "9+" : unread; badge.hidden = !unread;
  bell.setAttribute("aria-label", unread ? `Notifications, ${unread} new` : "Notifications");
  const panel = $("#notif-panel");
  panel.hidden = !S.notifOpen;
  if (S.notifOpen) panel.innerHTML = `
    <div class="np-head"><strong>Notifications</strong>${unread ? `<button class="linkish" data-act="notif-read">Mark all read</button>` : ""}</div>
    ${list.length ? `<ul class="np-list">${list.map((n) => `<li class="${n.unread ? "unread" : ""}"><a href="${n.href}" data-act="notif-go">${n.text}<span class="np-time">${ago(n.t)}</span></a></li>`).join("")}</ul>`
      : `<p class="muted np-empty">Nothing yet. Requests, board jobs and replies will show up here.</p>`}`;
}
async function markRead() {
  S.seenOverride = Date.now(); renderBell();
  try { await S.B.markNotifsSeen(); } catch {}
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
  if (S.notifOpen && !e.target.closest("#notif-panel,#bell")) { S.notifOpen = false; renderBell(); }
  if (S.onlineOpen && !e.target.closest("#online-panel,#online-btn")) { S.onlineOpen = false; renderOnline(); }
  const t = e.target.closest("[data-act],[data-recipe],[data-prof]");
  if (!t) { if (e.target.id === "auth") $("#auth").hidden = true; return; }
  if (t.dataset.recipe) { S.sel = Number(t.dataset.recipe); S.reqFor = null; history.replaceState(null, "", "#recipe-" + S.sel); renderRecipes(); return; }
  if (t.dataset.prof !== undefined && !t.dataset.act) { S.prof = Number(t.dataset.prof); S.limit = 150; renderRecipes(); return; }
  const act = t.dataset.act;
  if (act === "signin") openAuth("in");
  else if (act === "signup") openAuth("up");
  else if (act === "bell") { S.notifOpen = !S.notifOpen; S.onlineOpen = false; renderBell(); renderOnline(); }
  else if (t.dataset.mapfind !== undefined || act === "mapfind") { if (window.GC_MAP) window.GC_MAP.show(t.dataset.mapfind); }
  else if (act === "online") { S.onlineOpen = !S.onlineOpen; S.notifOpen = false; renderOnline(); renderBell(); }
  else if (act === "chat") {
    const k = t.dataset.key; S.chatOpen.has(k) ? S.chatOpen.delete(k) : S.chatOpen.add(k);
    if (S.view === "board") renderBoard(); else renderRequests();
    scrollChats();
    const f = document.querySelector(`.chat-form[data-key="${k}"] input`); if (f) f.focus();
  }
  else if (act === "msg-del") { t.disabled = true; try { await S.B.deleteMessage(t.dataset.id); await refresh(); } catch (err) { note("Couldn't delete that message: " + err.message); } }
  else if (act === "avatar-remove") { try { await S.B.removeAvatar(); (S.profiles[S.uid] || {}).avatar = ""; renderProfile(); renderWho(); syncPresence(); } catch (err) { note(err.message); } }
  else if (act === "discord") { try { await S.B.signInWithDiscord(); } catch (err) { $("#a-err").textContent = err.message; } }
  else if (act === "notif-read") markRead();
  else if (act === "notif-go") { S.notifOpen = false; markRead(); }
  else if (act === "post-toggle") { S.postOpen = !S.postOpen; renderBoard(); if (S.postOpen) $("#bf-title").focus(); }
  else if (act === "board-tab") { S.boardTab = t.dataset.t; renderBoard(); }
  else if (act === "board-cat") { S.boardCat = t.dataset.c; renderBoard(); }
  else if (act === "post") {
    const op = t.dataset.op, id = t.dataset.id;
    if (op === "delete" && t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to remove"; return; }
    let fields = null;
    if (op === "claim") {
      const ch = defaultChar() || prof(S.uid).mainChar;
      if (!ch) { note("Set your main character on your profile (or add one on My crafter) first, so the poster knows who's helping."); return; }
      fields = { status: "claimed", claimer: S.uid, claimerChar: ch };
    } else if (op === "done") fields = { status: "done" };
    else if (op === "release" || op === "reopen") fields = { status: "open" };
    else if (op === "cancel") fields = { status: "cancelled" };
    t.disabled = true;
    try { op === "delete" ? await S.B.deletePost(id) : await S.B.updatePost(id, fields); await refresh(); }
    catch (err) { note(err.message.includes("already taken") ? "Someone else took that job first." : "Couldn't update that post: " + err.message); t.disabled = false; refresh(); }
  }
  else if (act === "auth-tab") openAuth(t.dataset.t);
  else if (act === "auth-close") $("#auth").hidden = true;
  else if (act === "signout") { try { await S.B.signOut(); } catch {} await loadMe(); refresh(); }
  else if (act === "link-bnet") { t.disabled = true; t.textContent = "Opening Battle.net…"; try { await S.B.linkBnet(); } catch (err) { note(err.message); t.disabled = false; t.textContent = "Link Battle.net account"; } }
  else if (act === "unlink-bnet") {
    if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to unlink"; return; }
    try { await S.B.unlinkBnet(); delete S.bnet[S.uid]; renderMine(); } catch (err) { note("Couldn't unlink: " + err.message); }
  }
  else if (act === "import-char") {
    const c = ((S.bnet[S.uid] || {}).characters || [])[Number(t.dataset.i)]; if (!c) return;
    const d = ensureMyDoc(); const name = String(c.name).slice(0, 24);
    if (!d.chars[name]) d.chars[name] = { profs: {}, realm: c.realm || "", level: c.level || 0, cls: c.cls || "" };
    S.editChar = name; lsSet("gc.editChar", name); if (!lsGet("gc.char")) lsSet("gc.char", name);
    queueSave(); renderMine();
  }
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
  else if (f.classList.contains("chat-form")) {
    const input = f.querySelector("input"), body = input.value.trim().slice(0, 500); if (!body) return;
    const [type, id] = f.dataset.key.split(":");
    btn.disabled = true;
    try {
      await S.B.sendMessage(type, id, body); input.value = ""; input.blur();
      await refresh(); if (S.view === "board") renderBoard(); else renderRequests(); scrollChats();
      const again = document.querySelector(`.chat-form[data-key="${f.dataset.key}"] input`); if (again) again.focus();
    }
    catch (x) { note("Couldn't send that message: " + x.message); btn.disabled = false; }
  }
  else if (f.id === "boardform") {
    const title = $("#bf-title").value.trim().slice(0, 80), ch = $("#bf-char").value.trim().slice(0, 24);
    if (!title || !ch) return;
    lsSet("gc.char", ch); btn.disabled = true;
    const rec = DATA_OK && RECIPES.find((r) => r.name.toLowerCase() === title.toLowerCase());
    try {
      await S.B.createPost({ category: $("#bf-cat").value, title, recipeId: rec ? rec.id : null, qty: Math.max(1, Math.min(9999, Number($("#bf-qty").value) || 1)),
        offer: Math.max(0, Number($("#bf-offer").value) || 0), note: $("#bf-note").value.trim().slice(0, 300), authorChar: ch });
      S.postOpen = false; S.boardTab = "open"; await refresh(); note("Posted. The whole guild can see it on the Request Board.");
    } catch (x) { note("Couldn't post that: " + x.message); btn.disabled = false; }
  }
  else if (f.id === "profform") {
    btn.disabled = true; const saved = $("#pr-saved");
    const fields = { mainChar: $("#pr-char").value.trim().slice(0, 24), mainRealm: $("#pr-realm").value.trim().slice(0, 40), mainClass: $("#pr-class").value,
      mainLevel: Math.max(0, Math.min(80, Number($("#pr-level").value) || 0)), faction: $("#pr-faction").value, discord: $("#pr-discord").value.trim().slice(0, 40),
      playTimes: $("#pr-times").value.trim().slice(0, 80), bio: $("#pr-bio").value.trim().slice(0, 400) };
    try { await S.B.saveProfile(fields); Object.assign(S.profiles[S.uid] || (S.profiles[S.uid] = {}), fields); saved.textContent = "Saved."; document.activeElement.blur(); renderProfile(); }
    catch (x) { saved.textContent = "Couldn't save: " + x.message; }
    btn.disabled = false;
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
  else if (t.id === "pr-avatar" && t.files && t.files[0]) {
    const msg = $("#pr-avatar-msg"); msg.textContent = "Uploading…";
    S.B.uploadAvatar(t.files[0]).then((url) => {
      (S.profiles[S.uid] || (S.profiles[S.uid] = {})).avatar = url;
      renderProfile(); renderWho(); syncPresence();
      const m = $("#pr-avatar-msg"); if (m) m.textContent = "Picture updated.";
    }).catch((err) => { const m = $("#pr-avatar-msg"); if (m) m.textContent = err.message; });
  }
  else if (t.id === "pf-fill" && t.value !== "") {
    const c = ((S.bnet[S.uid] || {}).characters || [])[Number(t.value)]; if (!c) return;
    $("#pr-char").value = String(c.name || "").slice(0, 24);
    $("#pr-realm").value = String(c.realm || "").slice(0, 40);
    if (CLASSES.includes(c.cls)) $("#pr-class").value = c.cls;
    $("#pr-level").value = c.level || "";
    if (c.faction === "Alliance" || c.faction === "Horde") $("#pr-faction").value = c.faction;
    $("#pr-saved").textContent = "Filled in from " + c.name + ". Press Save profile to keep it.";
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
